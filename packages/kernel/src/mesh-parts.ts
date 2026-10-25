/**
 * Meshes a large import across several workers, since each part meshes independently (one worker
 * took 22 s for the Voron's 1,715 parts). The reading worker splits the parts into BREP packets
 * (`split`), helpers mesh and outline them (`meshPacket`), and the results are adopted (`adopt`)
 * so the ordinary mesher finds them as already meshed (`known`). Packets use the store's format
 * (`mesh-store.ts`), which names faces by index within their part and so survives the trip between
 * workers whose hashes differ.
 */

import { decodeEdges, decodeMeshes, encodeEdges, encodeMeshes } from './mesh-store.js';
import {
  type Counted,
  edgesOfPiece,
  MESH_HASH_UPPER_BOUND,
  meshPiece,
  type Piece,
  pieceBudgetMs,
  QUIET_MS,
  solidLeaves,
} from './tessellation.js';
import type { EdgeSet, TessellationOptions } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/** One packet of parts: where it sits among the shape's parts, and the parts as BREP. */
export interface MeshPacket {
  first: number;
  end: number;
  brep: Uint8Array;
}

/** A packet's meshes and outlines, in the store's format. */
export interface MeshedPacket {
  meshes: Uint8Array;
  edges: Uint8Array;
}

/** The parts of `shape` cut into `count` packets of about the same number of faces. */
export function splitForMeshing(
  occt: RawKernel,
  shape: RawHandle,
  count: number,
  alive: () => void = () => {},
): MeshPacket[] | null {
  const parts = solidLeaves(occt, shape);
  if (parts === null || parts.length < count) {
    for (const part of parts ?? []) occt.release(part);
    return null;
  }
  try {
    const faces = parts.map((part) => occt.subShapeCount(part, 'face'));
    const total = faces.reduce((sum, n) => sum + n, 0);
    const packets: MeshPacket[] = [];
    let first = 0;
    let taken = 0;
    for (let index = 0; index < parts.length; index++) {
      taken += faces[index] ?? 0;
      const last = index === parts.length - 1;
      if (!last && taken < (total * (packets.length + 1)) / count) continue;
      const end = index + 1;
      const packet = occt.makeCompound(parts.slice(first, end));
      try {
        packets.push({ first, end, brep: occt.toBREPBinary(packet) });
      } finally {
        occt.release(packet);
      }
      alive();
      first = end;
    }
    return packets;
  } finally {
    for (const part of parts) occt.release(part);
  }
}

/** A packet read and meshed, in a worker of its own. */
export function meshPacket(
  occt: RawKernel,
  brep: Uint8Array,
  options: TessellationOptions,
  alive: (budgetMs?: number) => void = () => {},
): MeshedPacket {
  const packet = occt.fromBREPBinary(brep);
  // A packet of one part is that part, not a compound of it.
  const parts = solidLeaves(occt, packet) ?? [occt.copy(packet)];
  try {
    const meshes: Counted<Piece>[] = [];
    const edges: Counted<EdgeSet>[] = [];
    for (const part of parts) {
      // A heavy part is one silent call; announce its time budget first.
      const budget = pieceBudgetMs(occt, part);
      if (budget > QUIET_MS) alive(budget);
      meshes.push({
        value: meshPiece(occt, part, options),
        count: occt.subShapeCount(part, 'face'),
      });
      edges.push({
        value: edgesOfPiece(occt, part, options),
        count: occt.subShapeCount(part, 'edge'),
      });
      alive();
    }
    return { meshes: encodeMeshes(occt, parts, meshes), edges: encodeEdges(edges) };
  } finally {
    for (const part of parts) occt.release(part);
    occt.release(packet);
  }
}

/** Meshes and outlines made elsewhere, waiting for the mesher to ask for their parts. */
export class AdoptedMeshes {
  readonly #occt: RawKernel;
  readonly #meshes = new Map<string, { part: RawHandle; piece: Piece }[]>();
  readonly #edges = new Map<string, { part: RawHandle; edges: EdgeSet }[]>();

  constructor(occt: RawKernel) {
    this.#occt = occt;
  }

  /** What a helper made for the parts `first` to `end` of `shape`; false when it does not fit. */
  adopt(
    shape: RawHandle,
    packet: { first: number; end: number } & MeshedPacket,
    options: TessellationOptions,
  ): boolean {
    const parts = solidLeaves(this.#occt, shape);
    if (parts === null) return false;
    const mine = parts.slice(packet.first, packet.end);
    for (const part of parts) if (!mine.includes(part)) this.#occt.release(part);
    const meshes = decodeMeshes(this.#occt, mine, packet.meshes);
    const edges = decodeEdges(mine.length, packet.edges);
    if (meshes === null || edges === null) {
      for (const part of mine) this.#occt.release(part);
      return false;
    }
    const setting = settingOf(options);
    mine.forEach((part, index) => {
      const key = `${this.#occt.hashCode(part, MESH_HASH_UPPER_BOUND)}|${setting}`;
      const piece = meshes[index]?.value;
      const outline = edges[index]?.value;
      if (piece !== undefined)
        this.#meshes.set(key, [...(this.#meshes.get(key) ?? []), { part, piece }]);
      if (outline !== undefined)
        this.#edges.set(key, [...(this.#edges.get(key) ?? []), { part, edges: outline }]);
    });
    return true;
  }

  /** The adopted mesh of `part` at this setting, if any; returned once, then released. */
  mesh(options: TessellationOptions): (part: RawHandle) => Piece | undefined {
    return (part) => this.#take(this.#meshes, part, options)?.piece;
  }

  edges(options: TessellationOptions): (part: RawHandle) => EdgeSet | undefined {
    return (part) => this.#take(this.#edges, part, options)?.edges;
  }

  #take<T extends { part: RawHandle }>(
    from: Map<string, T[]>,
    part: RawHandle,
    options: TessellationOptions,
  ): T | undefined {
    if (from.size === 0) return undefined;
    const key = `${this.#occt.hashCode(part, MESH_HASH_UPPER_BOUND)}|${settingOf(options)}`;
    const entries = from.get(key);
    const index = entries?.findIndex((entry) => this.#occt.isEqual(entry.part, part)) ?? -1;
    if (entries === undefined || index < 0) return undefined;
    const [found] = entries.splice(index, 1);
    if (entries.length === 0) from.delete(key);
    // The mesher's cache keeps it from here; release the handle held for matching.
    if (found !== undefined && !this.#holds(found.part)) this.#occt.release(found.part);
    return found;
  }

  /** Whether the other map still matches against this handle. */
  #holds(part: RawHandle): boolean {
    for (const entries of [...this.#meshes.values(), ...this.#edges.values()])
      if (entries.some((entry) => entry.part === part)) return true;
    return false;
  }
}

function settingOf(options: TessellationOptions): string {
  return `${options.linearDeflection}|${options.angularDeflection}`;
}
