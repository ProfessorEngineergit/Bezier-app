/**
 * Decides when an import's meshes and outlines are read from and written to the shape store
 * (`mesh-store.ts` defines the format). Before meshing, stored pieces are handed to the mesher;
 * after, missing ones are written once every solid of the import is meshed. Failures are silent.
 */

import {
  decodeEdges,
  decodeMeshes,
  edgeKey,
  encodeEdges,
  encodeMeshes,
  meshKey,
} from './mesh-store.js';
import { opened, type ShapeStore, sealed } from './shape-store.js';
import {
  type Counted,
  MESH_HASH_UPPER_BOUND,
  type Piece,
  type SolidCache,
} from './tessellation.js';
import type { EdgeSet, TessellationOptions, Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/** How many imports are remembered. More than a project usually holds. */
const REMEMBERED = 4;

/** What the store holds for one import at one setting, as far as is known. */
type Kept<T> = { state: 'read'; pieces: T[] } | { state: 'absent' } | { state: 'written' };

interface Import {
  key: string;
  /** What its meshes and outlines are kept under: its own key, or the import it was moved from. */
  stored: string;
  /** How far it stands from the kept meshes and outlines; absent for the import as read. */
  offset?: Vec3;
  /** The import's solids, in the order they were kept. Owned here. */
  solids: RawHandle[];
  /** Solid positions by hash, to recognise a solid inside a larger body. */
  byHash: Map<number, number[]>;
  meshes: Map<string, Kept<Counted<Piece>>>;
  edges: Map<string, Kept<Counted<EdgeSet>>>;
}

export class KeptDisplays {
  readonly #occt: RawKernel;
  readonly #store: ShapeStore;
  #imports: Import[] = [];

  constructor(occt: RawKernel, store: ShapeStore) {
    this.#occt = occt;
    this.#store = store;
  }

  /** An import read through the store under `key`. */
  remember(key: string, shape: RawHandle): void {
    if (this.#imports.some((known) => known.key === key)) return;
    const solids = this.#occt.getSubShapes(shape, 'solid');
    const byHash = new Map<number, number[]>();
    solids.forEach((solid, index) => {
      const hash = this.#occt.hashCode(solid, MESH_HASH_UPPER_BOUND);
      byHash.set(hash, [...(byHash.get(hash) ?? []), index]);
    });
    this.#add({ key, stored: key, solids, byHash, meshes: new Map(), edges: new Map() });
  }

  /**
   * Records that `moved` is `source` moved by `by`, sharing its topology (`located`), so a kept
   * import stays kept after placement. Otherwise the Voron was meshed again after its move (50 s).
   */
  follow(source: RawHandle, moved: RawHandle, by: Vec3): void {
    const solids = this.#occt.getSubShapes(source, 'solid');
    try {
      const known = this.#imports.find(
        (candidate) =>
          candidate.solids.length === solids.length &&
          candidate.solids.every((solid, i) => {
            const other = solids[i];
            return other !== undefined && this.#occt.isEqual(solid, other);
          }),
      );
      if (known === undefined) return;
      const offset = {
        x: (known.offset?.x ?? 0) + by.x,
        y: (known.offset?.y ?? 0) + by.y,
        z: (known.offset?.z ?? 0) + by.z,
      };
      const key = `${known.stored}@${offset.x},${offset.y},${offset.z}`;
      if (this.#imports.some((other) => other.key === key)) return;
      const placed = this.#occt.getSubShapes(moved, 'solid');
      const byHash = new Map<number, number[]>();
      placed.forEach((solid, index) => {
        const hash = this.#occt.hashCode(solid, MESH_HASH_UPPER_BOUND);
        byHash.set(hash, [...(byHash.get(hash) ?? []), index]);
      });
      this.#add({
        key,
        stored: known.stored,
        offset,
        solids: placed,
        byHash,
        meshes: new Map(),
        edges: new Map(),
      });
    } finally {
      for (const solid of solids) this.#occt.release(solid);
    }
  }

  #add(known: Import): void {
    this.#imports.push(known);
    while (this.#imports.length > REMEMBERED) {
      const oldest = this.#imports.shift();
      for (const solid of oldest?.solids ?? []) this.#occt.release(solid);
    }
  }

  /** Read what the store holds for this setting, for the imports not asked yet. */
  async prepare(options: TessellationOptions): Promise<void> {
    const setting = settingOf(options);
    for (const known of this.#imports) {
      // A moved import stores nothing of its own; it reuses the original's, offset.
      const missing = known.offset === undefined ? 'absent' : 'written';
      if (!known.meshes.has(setting)) {
        const bytes = await this.#read(meshKey(known.stored, options));
        const pieces = bytes === null ? null : decodeMeshes(this.#occt, known.solids, bytes);
        if (pieces !== null && known.offset !== undefined)
          for (const piece of pieces) shift(piece.value.positions, known.offset);
        known.meshes.set(setting, pieces === null ? { state: missing } : { state: 'read', pieces });
      }
      if (!known.edges.has(edgeSetting(options))) {
        const bytes = await this.#read(edgeKey(known.stored, options));
        const pieces = bytes === null ? null : decodeEdges(known.solids.length, bytes);
        if (pieces !== null && known.offset !== undefined)
          for (const piece of pieces) shift(piece.value.positions, known.offset);
        known.edges.set(
          edgeSetting(options),
          pieces === null ? { state: missing } : { state: 'read', pieces },
        );
      }
    }
  }

  /** The kept mesh of `solid` at this setting, if it belongs to a kept import. */
  mesh(options: TessellationOptions): (solid: RawHandle) => Piece | undefined {
    const setting = settingOf(options);
    return (solid) => this.#find(solid, (known) => known.meshes.get(setting))?.value;
  }

  /** The kept outline of `solid` at this setting. */
  edges(options: TessellationOptions): (solid: RawHandle) => EdgeSet | undefined {
    const setting = edgeSetting(options);
    return (solid) => this.#find(solid, (known) => known.edges.get(setting))?.value;
  }

  /**
   * Writes what the store did not hold. Waits for every solid of an import, since a partial file
   * would be read back as whole.
   */
  async keep(
    options: TessellationOptions,
    meshes: SolidCache<Counted<Piece>>,
    edges: SolidCache<Counted<EdgeSet>>,
  ): Promise<void> {
    const setting = settingOf(options);
    const meshSetting = `${options.linearDeflection}|${options.angularDeflection}`;
    for (const known of this.#imports) {
      if (known.meshes.get(setting)?.state === 'absent') {
        const pieces = this.#collect(known, meshes, meshSetting);
        if (pieces !== null) {
          known.meshes.set(setting, { state: 'written' });
          await this.#write(
            meshKey(known.key, options),
            encodeMeshes(this.#occt, known.solids, pieces),
          );
        }
      }
      if (known.edges.get(edgeSetting(options))?.state === 'absent') {
        const pieces = this.#collect(known, edges, edgeSetting(options));
        if (pieces !== null) {
          known.edges.set(edgeSetting(options), { state: 'written' });
          await this.#write(edgeKey(known.key, options), encodeEdges(pieces));
        }
      }
    }
  }

  #find<T>(solid: RawHandle, kept: (known: Import) => Kept<T> | undefined): T | undefined {
    const hash = this.#occt.hashCode(solid, MESH_HASH_UPPER_BOUND);
    for (const known of this.#imports) {
      const entry = kept(known);
      if (entry?.state !== 'read') continue;
      for (const index of known.byHash.get(hash) ?? []) {
        const candidate = known.solids[index];
        if (candidate !== undefined && this.#occt.isEqual(candidate, solid))
          return entry.pieces[index];
      }
    }
    return undefined;
  }

  /** Every solid's value from `cache`, or null while any is missing. */
  #collect<T>(known: Import, cache: SolidCache<T>, setting: string): T[] | null {
    const values: T[] = [];
    for (const solid of known.solids) {
      const hash = this.#occt.hashCode(solid, MESH_HASH_UPPER_BOUND);
      const value = cache.peek(this.#occt, solid, `${hash}|${setting}`);
      if (value === undefined) return null;
      values.push(value);
    }
    return values;
  }

  async #read(key: string): Promise<Uint8Array | null> {
    try {
      const entry = await this.#store.read(key);
      return entry === null ? null : await opened(entry);
    } catch {
      return null;
    }
  }

  async #write(key: string, bytes: Uint8Array): Promise<void> {
    try {
      await this.#store.write(key, await sealed(bytes));
    } catch {
      // Storing only saves time later.
    }
  }
}

/** Points moved by `by`, in place: decoded for this one use, nothing else holds them. */
function shift(positions: Float32Array, by: Vec3): void {
  for (let i = 0; i + 2 < positions.length; i += 3) {
    positions[i] = (positions[i] ?? 0) + by.x;
    positions[i + 1] = (positions[i + 1] ?? 0) + by.y;
    positions[i + 2] = (positions[i + 2] ?? 0) + by.z;
  }
}

function settingOf(options: TessellationOptions): string {
  return `${options.linearDeflection}|${options.angularDeflection}`;
}

/** What an outline is cached under: the outline follows the mesh, so both its settings count. */
function edgeSetting(options: TessellationOptions): string {
  return `${options.linearDeflection}|${options.angularDeflection}`;
}
