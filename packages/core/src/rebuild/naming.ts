/**
 * Persistent face naming across rebuilds, by provenance (ADR 0001): kernel hashes and geometry
 * are not stable identities.
 *
 *   1. A feature that creates geometry names its faces `F:<feature>:<tag>`.
 *   2. Names follow an operation's `EvolutionData` from prior faces to new ones.
 *   3. Faces with no ancestor are named by the feature that made them.
 *   4. Edges and vertices are named by their adjacent faces.
 */

import type {
  Bounds,
  EvolutionData,
  FaceDescription,
  FaceHash,
  FaceMeasurement,
  GeometryKernel,
  KernelResult,
  ShapeId,
  Vec3,
} from '@bezier/kernel';
import { edgeRef, faceRef, formatRef, type StableRef } from '../stable-ref.js';

/** Decimals kept in an ordering key, to absorb float noise. */
const ORDER_PRECISION = 4;

function round(n: number): number {
  return Number.parseFloat(n.toFixed(ORDER_PRECISION));
}

/**
 * Deterministic ordering key for new faces: surface type, then the face's direction from the body
 * centre (stable when dimensions change, unlike area or position), then area as a tie-break.
 *
 * The weakest link in naming: two faces in the same direction from the centre are ambiguous. See
 * docs/roadmap.md (M2).
 */
function orderingKey(
  face: FaceDescription,
  measurement: FaceMeasurement,
  bodyCentre: Vec3,
): string {
  const dx = measurement.centre.x - bodyCentre.x;
  const dy = measurement.centre.y - bodyCentre.y;
  const dz = measurement.centre.z - bodyCentre.z;
  const length = Math.hypot(dx, dy, dz) || 1;

  return [
    face.surfaceType,
    round(dx / length),
    round(dy / length),
    round(dz / length),
    round(measurement.area),
  ].join('|');
}

/**
 * Reference point for face ordering. A bounding-box centre is deterministic and avoids measuring
 * every face.
 */
function centreOf(bounds: Bounds): Vec3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
}

/**
 * Bounds of the solids that own the new faces, not the whole body, so another solid in the same
 * body (ADR 0012) cannot change the names. Same as the body bounds for a single solid.
 */
async function frameOf(
  kernel: GeometryKernel,
  body: ShapeId,
  faces: readonly FaceDescription[],
): Promise<KernelResult<Bounds>> {
  const owners = await kernel.partition(
    body,
    faces.map((face) => face.id),
  );
  if (!owners.ok) return kernel.bounds(body);
  try {
    return owners.value.remainder === null
      ? await kernel.bounds(body)
      : await kernel.bounds(owners.value.selected);
  } finally {
    await kernel.dispose(owners.value.selected);
    if (owners.value.remainder !== null) await kernel.dispose(owners.value.remainder);
  }
}

/**
 * Expands a declared tag pattern such as `['start', 'end', 'side-*']` to a concrete tag. The
 * starred family expands by index.
 */
function tagAt(tags: readonly string[], index: number, total: number): string {
  const fixed = tags.filter((t) => !t.endsWith('*'));
  const family = tags.find((t) => t.endsWith('*'));

  // Fixed tags first, in declaration order, then the family. A family-only pattern starts at 0.
  if (index < fixed.length && total >= fixed.length) {
    return fixed[index] ?? `face-${index}`;
  }
  if (family !== undefined) {
    return `${family.slice(0, -1)}${index - Math.min(fixed.length, total)}`;
  }
  return `face-${index}`;
}

/**
 * Copy of the naming state for the rebuild cache. Holds live handles, so it is valid only as long
 * as the cache entry holding it.
 */
export interface NamingSnapshot {
  names: ReadonlyMap<FaceHash, string>;
  faces: ReadonlyMap<FaceHash, FaceDescription>;
  /** Names shared by the pieces of a split face, pieces in their fixed order. */
  pieces?: ReadonlyMap<string, readonly FaceHash[]>;
}

/**
 * Face names of the current body. Rebuilt each pass because hashes are valid within one pass only;
 * the names themselves persist in feature parameters.
 */
export class FaceNaming {
  /** Live face hash → its stable name, in canonical text form. */
  readonly #names = new Map<FaceHash, string>();
  /** Live face hash → handle and signature, for resolving references. */
  readonly #faces = new Map<FaceHash, FaceDescription>();
  /**
   * Names shared by several faces after a split. Ordered by area, then position, so a name
   * resolves to the same piece every rebuild regardless of kernel hash order.
   */
  readonly #pieces = new Map<string, FaceHash[]>();

  /** Names the faces of a body with no prior body, as from the first feature. */
  async seed(
    kernel: GeometryKernel,
    featureId: string,
    body: ShapeId,
    faces: readonly FaceDescription[],
    tags: readonly string[],
    inOrder = false,
  ): Promise<void> {
    this.#names.clear();
    this.#faces.clear();
    this.#pieces.clear();
    await this.#assign(kernel, featureId, body, faces, tags, faces, inOrder);
  }

  /**
   * Carries names across one operation via `EvolutionData`. Faces with no ancestor are named
   * after the feature that produced them.
   */
  async advance(
    kernel: GeometryKernel,
    featureId: string,
    body: ShapeId,
    evolution: EvolutionData,
    faces: readonly FaceDescription[],
    tags: readonly string[],
    inOrder = false,
  ): Promise<void> {
    const carried = new Map<FaceHash, string>();

    // Unchanged faces keep their names.
    for (const hash of evolution.unchanged) {
      const name = this.#names.get(hash);
      if (name !== undefined) carried.set(hash, name);
    }

    // A modified face passes its name to every face it became; `#orderPieces` fixes which piece
    // the name resolves to.
    for (const entry of evolution.modified) {
      const name = this.#names.get(entry.from);
      if (name === undefined) continue;
      for (const to of entry.to) carried.set(to, name);
    }

    this.#names.clear();
    this.#faces.clear();
    for (const [hash, name] of carried) this.#names.set(hash, name);
    for (const face of faces) this.#faces.set(face.hash, face);

    // The rest is new geometry, named after this feature.
    const fresh = faces.filter((f) => !this.#names.has(f.hash));
    await this.#assign(kernel, featureId, body, fresh, tags, faces, inOrder);
    await this.#orderPieces(kernel);
  }

  /** Orders the pieces of every split face. */
  async #orderPieces(kernel: GeometryKernel): Promise<void> {
    this.#pieces.clear();
    // Append in place; copying per face is costly on large assemblies (~100k faces).
    const byName = new Map<string, FaceHash[]>();
    for (const [hash, name] of this.#names) {
      const hashes = byName.get(name);
      if (hashes === undefined) byName.set(name, [hash]);
      else hashes.push(hash);
    }
    for (const [name, hashes] of byName) {
      if (hashes.length < 2) continue;
      const live = hashes.filter((hash) => this.#faces.has(hash));
      const measured = await kernel.measureFaces(
        live.map((hash) => this.#faces.get(hash)?.id ?? (-1 as ShapeId)),
      );
      if (!measured.ok) {
        this.#pieces.set(name, live);
        continue;
      }
      const keyed = live.map((hash, i) => ({ hash, m: measured.value[i] }));
      keyed.sort((a, b) => {
        const am = a.m;
        const bm = b.m;
        if (am === undefined || bm === undefined) return 0;
        return (
          round(bm.area) - round(am.area) ||
          round(am.centre.z) - round(bm.centre.z) ||
          round(am.centre.y) - round(bm.centre.y) ||
          round(am.centre.x) - round(bm.centre.x)
        );
      });
      this.#pieces.set(
        name,
        keyed.map((entry) => entry.hash),
      );
    }
  }

  async #assign(
    kernel: GeometryKernel,
    featureId: string,
    body: ShapeId,
    toName: readonly FaceDescription[],
    tags: readonly string[],
    allFaces: readonly FaceDescription[],
    inOrder = false,
  ): Promise<void> {
    for (const face of allFaces) this.#faces.set(face.hash, face);
    if (toName.length === 0) return;

    // Imported geometry is named in kernel order, which is stable for the same file, without
    // measuring.
    if (inOrder) {
      toName.forEach((face, index) => {
        this.#names.set(
          face.hash,
          formatRef(faceRef(featureId, tagAt(tags, index, toName.length))),
        );
      });
      return;
    }

    // Measure only the faces being named; measuring all faces cost about 18% of a rebuild.
    const [measured, box] = await Promise.all([
      kernel.measureFaces(toName.map((f) => f.id)),
      frameOf(kernel, body, toName),
    ]);
    if (!measured.ok || !box.ok) return;

    const centre = centreOf(box.value);
    const keys = new Map<FaceHash, string>();
    toName.forEach((face, i) => {
      const measurement = measured.value[i];
      if (measurement !== undefined) keys.set(face.hash, orderingKey(face, measurement, centre));
    });

    const ordered = [...toName].sort((a, b) =>
      (keys.get(a.hash) ?? '').localeCompare(keys.get(b.hash) ?? '', 'en'),
    );

    ordered.forEach((face, index) => {
      this.#names.set(face.hash, formatRef(faceRef(featureId, tagAt(tags, index, ordered.length))));
    });
  }

  /** Current names by face hash, without copying (unlike `snapshot()`). */
  get names(): ReadonlyMap<FaceHash, string> {
    return this.#names;
  }

  /** Copies the state so a cache hit can restore it. */
  snapshot(): NamingSnapshot {
    return {
      names: new Map(this.#names),
      faces: new Map(this.#faces),
      pieces: new Map([...this.#pieces].map(([name, hashes]) => [name, [...hashes]])),
    };
  }

  /** Clears all names, when there is no body. */
  clear(): void {
    this.#names.clear();
    this.#faces.clear();
    this.#pieces.clear();
  }

  /** Restores a snapshot from the same rebuild session. */
  restore(snapshot: NamingSnapshot): void {
    this.#names.clear();
    this.#faces.clear();
    for (const [hash, name] of snapshot.names) this.#names.set(hash, name);
    for (const [hash, face] of snapshot.faces) this.#faces.set(hash, face);
    this.#pieces.clear();
    for (const [name, hashes] of snapshot.pieces ?? []) this.#pieces.set(name, [...hashes]);
  }

  /** All current names, for detecting dangling references. */
  knownNames(): ReadonlySet<string> {
    return new Set(this.#names.values());
  }

  /** The live handle for a named face, or null if the name is gone. */
  faceFor(name: string): ShapeId | null {
    return this.#facesFor(name)[0] ?? null;
  }

  /** All live faces with `name`: one, or the ordered pieces of a split face. */
  #facesFor(name: string): ShapeId[] {
    const pieces = this.#pieces.get(name);
    if (pieces !== undefined) {
      return pieces.flatMap((hash) => {
        const id = this.#faces.get(hash)?.id;
        return id === undefined ? [] : [id];
      });
    }
    for (const [hash, candidate] of this.#names) {
      if (candidate !== name) continue;
      const id = this.#faces.get(hash)?.id;
      return id === undefined ? [] : [id];
    }
    return [];
  }

  /**
   * Synchronous resolution for face references; returns null for edges, which need `resolve()`.
   * Exists because the rebuild loop's `resolve` callback is synchronous.
   */
  faceForRef(ref: StableRef): ShapeId | null {
    return ref.kind === 'face' ? this.faceFor(formatRef(ref)) : null;
  }

  /**
   * Resolves a stable reference to a kernel handle. Edges and vertices resolve through their
   * adjacent faces. Returns null instead of guessing, so the dependent feature reports the loss
   * rather than acting on the wrong geometry.
   */
  async resolve(kernel: GeometryKernel, ref: StableRef): Promise<ShapeId | null> {
    if (ref.kind === 'face') return this.faceFor(formatRef(ref));

    if (ref.kind === 'edge') {
      const [a, b] = ref.faces;
      if (a === undefined || b === undefined) return null;
      const facesA = this.#facesFor(formatRef(a));
      const facesB = this.#facesFor(formatRef(b));
      // Try split pieces in their fixed order, so the same edge is found every time.
      for (const faceA of facesA) {
        for (const faceB of facesB) {
          const edge = await kernel.sharedEdge(faceA, faceB);
          if (edge.ok && edge.value !== null) return edge.value;
        }
      }
      return null;
    }

    // Vertex: the point shared by all its faces, split pieces tried in order as for an edge.
    const pieces = ref.faces.map((face) => this.#facesFor(formatRef(face)));
    for (const chosen of combinations(pieces)) {
      const corner = await kernel.sharedVertex(chosen);
      if (corner.ok && corner.value !== null) return corner.value;
    }
    return null;
  }

  /** All currently nameable edges, for the UI's selection layer. */
  async namedEdges(kernel: GeometryKernel): Promise<Map<string, ShapeId>> {
    const found = new Map<string, ShapeId>();
    const entries = [...this.#names.entries()];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const left = entries[i];
        const right = entries[j];
        if (left === undefined || right === undefined) continue;

        const faceA = this.#faces.get(left[0]);
        const faceB = this.#faces.get(right[0]);
        if (faceA === undefined || faceB === undefined) continue;

        const edge = await kernel.sharedEdge(faceA.id, faceB.id);
        if (!edge.ok || edge.value === null) continue;

        // Rebuild through `edgeRef` so the face order is canonical.
        const parsed = parseFaceName(left[1]);
        const other = parsed === null ? null : parseFaceName(right[1]);
        if (parsed === null || other === null) continue;

        found.set(formatRef(edgeRef(parsed, other)), edge.value);
      }
    }
    return found;
  }
}

/** `F:extrude-1:side-2` back into a `FaceRef`. Null if it is not a face name. */
function parseFaceName(name: string): ReturnType<typeof faceRef> | null {
  const parts = name.split(':');
  const [prefix, feature, tag] = parts;
  if (prefix !== 'F' || feature === undefined || tag === undefined || parts.length !== 3) {
    return null;
  }
  return faceRef(feature, tag);
}

/** Every choice of one piece per face, capped at `limit`. */
function* combinations<T>(lists: readonly (readonly T[])[], limit = 64): Generator<T[]> {
  let produced = 0;
  function* walk(at: number, chosen: T[]): Generator<T[]> {
    if (produced >= limit) return;
    if (at === lists.length) {
      produced++;
      yield [...chosen];
      return;
    }
    for (const item of lists[at] ?? []) yield* walk(at + 1, [...chosen, item]);
  }
  yield* walk(0, []);
}
