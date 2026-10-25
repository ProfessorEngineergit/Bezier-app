/**
 * Meshes, outlines and bounds computed solid by solid and joined. On the whole 1,715-solid Voron
 * compound, `meshShape` failed with "memory access out of bounds", `wireframe` ran over ten
 * minutes and `getBoundingBox` took 57 s; per solid it took 2.4 s and 31 ms per hundred solids.
 */

import { completePiece } from './mesh-mend.js';
import type { Bounds, EdgeSet, Mesh, MeshPiece, TessellationOptions } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/**
 * The upper bound `meshShape` uses internally for face-group hashes (measured against occt-wasm
 * 3.8.3: `hashCode(face, 2147483647)`). It may differ from the naming bound, so meshing resolves
 * groups to face positions instead of passing hashes through.
 */
export const MESH_HASH_UPPER_BOUND = 2_147_483_647;

/** A value kept per solid, with how many faces or edges the solid has. */
export interface Counted<T> {
  value: T;
  count: number;
}

/**
 * The non-compound leaves of `handle` in compound order, or null when it is a single part. Leaves
 * include loose shells and faces, which some STEP files hold beside their solids (the Voron has
 * 1,052 shells among 995 solids); they must not send the assembly down the whole-shape path.
 * Found by walking children, not by counting (counting the Voron's 300,000 edges took 0.8 s).
 */
export function solidLeaves(occt: RawKernel, handle: RawHandle): RawHandle[] | null {
  const found: RawHandle[] = [];
  const walk = (shape: RawHandle, owned: boolean): void => {
    if (occt.getShapeType(shape) === 'compound') {
      for (const child of occt.iterShapes(shape)) walk(child, true);
      if (owned) occt.release(shape);
      return;
    }
    if (owned) found.push(shape);
  };
  walk(handle, false);
  if (found.length <= 1) {
    for (const part of found) occt.release(part);
    return null;
  }
  return found;
}

/** How long the worker may be silent before it is taken for hung (`worker/supervisor.ts`). */
export const QUIET_MS = 30_000;
/** Allowed time per edge of a solid, in milliseconds, before the worker is presumed hung. */
const MS_PER_EDGE = 40;

/**
 * How long one solid may run silent, from its edge count. Meshing is roughly linear in edges, worse
 * for faces with thousands of holes: a 4,662-face speaker grille (Framework 16) takes 46 s on a
 * fast Mac in one uninterruptible call. Announced before the call, so a hang is still detected.
 */
export function pieceBudgetMs(occt: RawKernel, solid: RawHandle): number {
  return QUIET_MS + occt.subShapeCount(solid, 'edge') * MS_PER_EDGE;
}

/**
 * A value per solid of `handle`, from `cache` where known, or null when `handle` is not a compound
 * (`solidLeaves`). Face or edge counts are stored with each value (`mesh-store.ts`).
 *
 * `exact` also rejects solids sharing faces or edges (as after a split), which would list a shared
 * face twice and break position-based naming (`describeFaces`). Checked against one count of the
 * whole: 55 ms for the Voron's 108,000 faces.
 */
export function perSolid<T>(
  occt: RawKernel,
  handle: RawHandle,
  kind: 'face' | 'edge',
  cache: SolidCache<Counted<T>>,
  keyOf: (hash: number) => string,
  make: (solid: RawHandle) => T,
  each: (value: T, fresh: boolean, solids: number) => void = () => {},
  exact = false,
  ahead: (budgetMs: number) => void = () => {},
): T[] | null {
  const solids = solidLeaves(occt, handle);
  if (solids === null) return null;
  const values: T[] = [];
  let counted = 0;
  for (const solid of solids) {
    // A heavy solid is one silent call; announce its time budget first.
    const budget = pieceBudgetMs(occt, solid);
    if (budget > QUIET_MS) ahead(budget);
    let fresh = false;
    const { value, kept } = cache.take(
      occt,
      solid,
      keyOf(occt.hashCode(solid, MESH_HASH_UPPER_BOUND)),
      () => {
        fresh = true;
        return { value: make(solid), count: occt.subShapeCount(solid, kind) };
      },
    );
    values.push(value.value);
    counted += value.count;
    each(value.value, fresh, solids.length);
    // A kept solid now belongs to the cache, which releases it on eviction.
    if (!kept) occt.release(solid);
  }
  return !exact || counted === occt.subShapeCount(handle, kind) ? values : null;
}

/**
 * One piece's triangles, faces still named by hash. Faces are numbered when pieces are joined
 * (`numberFaces`), so a piece can be reused in a body where its faces sit at other positions.
 */
export interface Piece {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Runs of triangles on one face: [firstTriangle, triangleCount, faceHash]. */
  runs: Uint32Array;
}

/** The finest settings each kernel has meshed at, as far as this module knows. */
const finest = new WeakMap<object, TessellationOptions>();

/**
 * Whether `options` is coarser than an earlier mesh in this kernel, the only case where a
 * leftover triangulation can be too fine and a copy is needed.
 */
function coarserThanBefore(occt: RawKernel, options: TessellationOptions): boolean {
  const before = finest.get(occt);
  finest.set(occt, {
    linearDeflection: Math.min(options.linearDeflection, before?.linearDeflection ?? Infinity),
    angularDeflection: Math.min(options.angularDeflection, before?.angularDeflection ?? Infinity),
  });
  return (
    before !== undefined &&
    (options.linearDeflection > before.linearDeflection ||
      options.angularDeflection > before.angularDeflection)
  );
}

/**
 * Meshes a copy when the shape already carries a triangulation. OCCT only remeshes for a finer
 * setting, so a coarser one silently returns the old mesh (the Voron stayed at 6.07 M triangles
 * where a fresh coarse mesh was 1.1 M). The copy's faces are renamed back by position.
 */
function meshFresh(
  occt: RawKernel,
  piece: RawHandle,
  options: TessellationOptions,
  apart: boolean,
): { mesh: ReturnType<RawKernel['meshShape']>; rename: ((hash: number) => number) | null } {
  const settings = {
    linearDeflection: options.linearDeflection,
    angularDeflection: options.angularDeflection,
  };
  if (!apart && (!coarserThanBefore(occt, options) || !occt.hasTriangulation(piece))) {
    return { mesh: occt.meshShape(piece, settings), rename: null };
  }
  const copy = occt.copy(piece);
  try {
    const mesh = occt.meshShape(copy, settings);
    const theirs = occt.subShapeHashes(copy, 'face', MESH_HASH_UPPER_BOUND);
    const ours = occt.subShapeHashes(piece, 'face', MESH_HASH_UPPER_BOUND);
    const back = new Map<number, number>();
    theirs.forEach((hash, index) => {
      back.set(hash >>> 0, (ours[index] ?? hash) >>> 0);
    });
    return { mesh, rename: (hash) => back.get(hash) ?? hash };
  } finally {
    occt.release(copy);
  }
}

/**
 * `apart` always meshes a copy and leaves the shape's triangulation and its record untouched, for
 * the view's levels of detail (`solid-detail.ts`).
 */
export function meshPiece(
  occt: RawKernel,
  piece: RawHandle,
  options: TessellationOptions,
  apart = false,
): Piece {
  const first = pieceFrom(meshFresh(occt, piece, options, apart));
  try {
    // The face hashes in `runs` are the shape's own (renamed when a copy was meshed).
    return completePiece(
      occt,
      piece,
      first,
      options,
      // Always on a copy: OCCT would return the failed triangulation for any setting not finer.
      (setting) => pieceFrom(meshFresh(occt, piece, setting, true)),
      () => occt.subShapeHashes(piece, 'face', MESH_HASH_UPPER_BOUND),
    );
  } catch {
    // A failed repair keeps the part as meshed, hole included.
    return first;
  }
}

function pieceFrom({
  mesh,
  rename,
}: {
  mesh: ReturnType<RawKernel['meshShape']>;
  rename: ((hash: number) => number) | null;
}): Piece {
  const groups = mesh.faceGroups ?? new Int32Array(0);
  const runs = new Uint32Array(groups.length - (groups.length % 3));
  // occt-wasm documents these triples as [triStart, triCount, faceHash], but they are index
  // offsets and counts: a box gives six groups of 6, summing to 36 indices. True in 3.8.3 and 5.3.
  for (let g = 0; g + 2 < groups.length; g += 3) {
    const firstTriangle = (groups[g] ?? 0) / 3;
    const triangleCount = (groups[g + 1] ?? 0) / 3;
    const meshed = (groups[g + 2] ?? 0) >>> 0;
    const hash = rename === null ? meshed : rename(meshed);
    runs[g] = firstTriangle;
    runs[g + 1] = triangleCount;
    runs[g + 2] = hash;
  }
  // Normals are used as they come: occt-wasm 5.3.5 already orients reversed faces' normals out of
  // the solid (3.8.3 did not). Pinned in `occt-kernel.test.ts`.
  return { positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, runs };
}

/**
 * Write each triangle's face as its position in `describeFaces()` on the whole body
 * (`positionOf`), starting at `firstTriangle` of `into`.
 */
function numberFaces(
  piece: Piece,
  positionOf: ReadonlyMap<number, number>,
  into: Uint32Array,
  firstTriangle: number,
): void {
  const { runs } = piece;
  for (let r = 0; r + 2 < runs.length; r += 3) {
    const face = positionOf.get(runs[r + 2] ?? 0);
    if (face === undefined) continue;
    const start = firstTriangle + (runs[r] ?? 0);
    into.fill(face, start, start + (runs[r + 1] ?? 0));
  }
}

/** Pieces joined into one mesh: vertices appended, indices shifted to match. */
export function joinMeshes(
  pieces: readonly Piece[],
  positionOf: ReadonlyMap<number, number>,
): Mesh {
  let floats = 0;
  let indexCount = 0;
  for (const piece of pieces) {
    floats += piece.positions.length;
    indexCount += piece.indices.length;
  }
  const joined: Mesh = {
    positions: new Float32Array(floats),
    normals: new Float32Array(floats),
    indices: new Uint32Array(indexCount),
    triangleFaces: new Uint32Array(indexCount / 3),
    solidTriangles: new Uint32Array(pieces.length + 1),
    solidVertices: new Uint32Array(pieces.length + 1),
  };
  let floatAt = 0;
  let indexAt = 0;
  pieces.forEach((piece, solid) => {
    joined.solidTriangles?.fill(indexAt / 3, solid);
    joined.solidVertices?.fill(floatAt / 3, solid);
    joined.positions.set(piece.positions, floatAt);
    joined.normals.set(piece.normals, floatAt);
    const firstVertex = floatAt / 3;
    for (let i = 0; i < piece.indices.length; i++) {
      joined.indices[indexAt + i] = (piece.indices[i] ?? 0) + firstVertex;
    }
    numberFaces(piece, positionOf, joined.triangleFaces, indexAt / 3);
    floatAt += piece.positions.length;
    indexAt += piece.indices.length;
  });
  joined.solidTriangles?.fill(indexAt / 3, pieces.length);
  joined.solidVertices?.fill(floatAt / 3, pieces.length);
  return joined;
}

/**
 * Per-solid cache of meshes and outlines across rebuilds; OCCT shapes are immutable, so untouched
 * solids keep their triangles (without it, remeshing the Voron was 8.8 s of a 10.5 s edit). Looked
 * up by hash and confirmed by `isEqual`, so collisions cannot swap parts. Bounded by size; evicted
 * entries release their handles.
 */
export class SolidCache<T> {
  readonly #limit: number;
  readonly #sizeOf: (value: T) => number;
  readonly #entries = new Map<string, { solid: RawHandle; value: T; size: number }[]>();
  #size = 0;

  /** `sizeOf` measures an entry in the unit `limit` is given in. */
  constructor(sizeOf: (value: T) => number, limit: number) {
    this.#sizeOf = sizeOf;
    this.#limit = limit;
  }

  /** The value kept for `solid`, if there is one, without making it. */
  peek(occt: RawKernel, solid: RawHandle, key: string): T | undefined {
    return this.#entries.get(key)?.find((entry) => occt.isEqual(entry.solid, solid))?.value;
  }

  /** The value for `solid`, made only if it is not already known. */
  take(occt: RawKernel, solid: RawHandle, key: string, make: () => T): { value: T; kept: boolean } {
    const bucket = this.#entries.get(key);
    const found = bucket?.find((entry) => occt.isEqual(entry.solid, solid));
    if (bucket !== undefined && found !== undefined) {
      // Most recently used goes last, so eviction takes the oldest first.
      this.#entries.delete(key);
      this.#entries.set(key, bucket);
      return { value: found.value, kept: false };
    }
    const value = make();
    const size = this.#sizeOf(value);
    if (size > this.#limit) return { value, kept: false };
    const entries = bucket ?? [];
    entries.push({ solid, value, size });
    this.#entries.delete(key);
    this.#entries.set(key, entries);
    this.#size += size;
    this.#evict(occt);
    return { value, kept: true };
  }

  #evict(occt: RawKernel): void {
    for (const [key, entries] of this.#entries) {
      if (this.#size <= this.#limit) return;
      for (const entry of entries) {
        occt.release(entry.solid);
        this.#size -= entry.size;
      }
      this.#entries.delete(key);
    }
  }
}

/** Meshes, measured in triangles plus vertices: about 12 M is some 300 MB. */
export function meshCache(): SolidCache<Counted<Piece>> {
  return new SolidCache(
    ({ value }) => value.indices.length / 3 + value.positions.length / 3,
    12_000_000,
  );
}

/** Outlines, measured in points. */
export function edgeCache(): SolidCache<Counted<EdgeSet>> {
  return new SolidCache(({ value }) => value.positions.length / 3, 12_000_000);
}

/**
 * Freshly meshed solids are streamed in batches so a large model builds up on screen; only for
 * bodies of at least this many solids, and only solids not already cached.
 */
const STREAM_FROM_SOLIDS = 50;
const STREAM_BATCH_TRIANGLES = 150_000;

export class Stream {
  readonly #send: (piece: MeshPiece) => void;
  #held: Piece[] = [];
  #triangles = 0;

  constructor(send: (piece: MeshPiece) => void) {
    this.#send = send;
  }

  add(piece: Piece): void {
    this.#held.push(piece);
    this.#triangles += piece.indices.length / 3;
    if (this.#triangles >= STREAM_BATCH_TRIANGLES) this.flush();
  }

  /** Joined into new arrays: the pieces themselves stay in the cache. */
  flush(): void {
    if (this.#held.length === 0) return;
    const joined = joinMeshes(this.#held, new Map());
    this.#send({ positions: joined.positions, normals: joined.normals, indices: joined.indices });
    this.#held = [];
    this.#triangles = 0;
  }
}

export function meshOf(
  occt: RawKernel,
  handle: RawHandle,
  options: TessellationOptions,
  cache: SolidCache<Counted<Piece>>,
  alive: (budgetMs?: number) => void = () => {},
  stream?: (piece: MeshPiece) => void,
  known: (solid: RawHandle) => Piece | undefined = () => undefined,
): Mesh {
  const faces = occt.subShapeHashes(handle, 'face', MESH_HASH_UPPER_BOUND);
  const positionOf = new Map<number, number>();
  faces.forEach((hash, index) => {
    positionOf.set(hash >>> 0, index);
  });
  const settings = `${options.linearDeflection}|${options.angularDeflection}`;
  const streaming = { to: null as Stream | null, reused: false };
  const pieces = perSolid(
    occt,
    handle,
    'face',
    cache,
    (hash) => `${hash}|${settings}`,
    (solid) => {
      const kept = known(solid);
      streaming.reused = kept !== undefined;
      return kept ?? meshPiece(occt, solid, options);
    },
    (piece, fresh, solids) => {
      if (streaming.to === null && stream !== undefined && solids >= STREAM_FROM_SOLIDS) {
        streaming.to = new Stream(stream);
      }
      // Only fresh meshes; streaming a stored mesh would copy it for nothing.
      if (fresh && !streaming.reused) streaming.to?.add(piece);
      alive();
    },
    false,
    alive,
  );
  if (pieces === null) return joinMeshes([meshPiece(occt, handle, options)], positionOf);
  return joinMeshes(pieces, positionOf);
}

/**
 * A solid's outlines taken from the face mesh's edge vertices, so lines and face highlights match
 * (curve sampling gave 32 vs 45 segments on a cylinder). The mesh must be the one at `options`:
 * an unmeshed shape is meshed here, and `apart` reads from a copy meshed at `options`.
 */
export function edgesOfPiece(
  occt: RawKernel,
  piece: RawHandle,
  options: TessellationOptions,
  apart = false,
): EdgeSet {
  if (!apart && occt.hasTriangulation(piece)) return readOutlines(occt, piece, options);
  // Mesh the shape in place at this setting, so the following mesh request finds it done.
  if (!apart) {
    coarserThanBefore(occt, options);
    occt.meshShape(piece, {
      linearDeflection: options.linearDeflection,
      angularDeflection: options.angularDeflection,
    });
    return readOutlines(occt, piece, options);
  }
  const copy = occt.copy(piece);
  try {
    occt.meshShape(copy, {
      linearDeflection: options.linearDeflection,
      angularDeflection: options.angularDeflection,
    });
    return readOutlines(occt, copy, options);
  } finally {
    occt.release(copy);
  }
}

function readOutlines(occt: RawKernel, piece: RawHandle, options: TessellationOptions): EdgeSet {
  const data = occt.wireframe(piece, {
    deflection: options.linearDeflection,
    source: 'triangulation',
  });
  const starts: number[] = [];
  for (let g = 0; g + 2 < data.edgeGroups.length; g += 3) {
    starts.push(data.edgeGroups[g] ?? 0);
  }
  return { positions: data.points, polylineStarts: Uint32Array.from(starts) };
}

export function edgesOf(
  occt: RawKernel,
  handle: RawHandle,
  options: TessellationOptions,
  cache: SolidCache<Counted<EdgeSet>>,
  alive: (budgetMs?: number) => void = () => {},
  known: (solid: RawHandle) => EdgeSet | undefined = () => undefined,
): EdgeSet {
  const pieces = perSolid(
    occt,
    handle,
    'edge',
    cache,
    (hash) => `${hash}|${options.linearDeflection}|${options.angularDeflection}`,
    (solid) => known(solid) ?? edgesOfPiece(occt, solid, options),
    () => alive(),
    false,
    alive,
  );
  if (pieces === null) return edgesOfPiece(occt, handle, options);
  return joinEdges(pieces);
}

/** Outlines joined end to end, with where each piece's lines begin. */
export function joinEdges(pieces: readonly EdgeSet[]): EdgeSet {
  let floats = 0;
  let lines = 0;
  for (const piece of pieces) {
    floats += piece.positions.length;
    lines += piece.polylineStarts.length;
  }
  const positions = new Float32Array(floats);
  const polylineStarts = new Uint32Array(lines);
  const solidLines = new Uint32Array(pieces.length + 1);
  let floatAt = 0;
  let lineAt = 0;
  pieces.forEach((piece, solid) => {
    solidLines[solid] = lineAt;
    positions.set(piece.positions, floatAt);
    // Offsets into the float array, not point indices: shifted by floats.
    for (let i = 0; i < piece.polylineStarts.length; i++) {
      polylineStarts[lineAt + i] = (piece.polylineStarts[i] ?? 0) + floatAt;
    }
    floatAt += piece.positions.length;
    lineAt += piece.polylineStarts.length;
  });
  solidLines[pieces.length] = lineAt;
  return { positions, polylineStarts, solidLines };
}

/**
 * Face count from which bounds are loose instead of exact. The exact box searches every surface for
 * extrema (41 s for the 179-solid Framework 16 on a fast Mac). The loose box (analytic extents,
 * spline control hulls) always contains the exact one and equals it for planes and cylinders.
 */
const EXACT_BOX_FACES = 1500;

/** The bounding box of a shape, as the union of its solids' boxes. */
export function boundsOf(
  occt: RawKernel,
  handle: RawHandle,
  alive: (budgetMs?: number) => void = () => {},
): Bounds {
  const solids = solidLeaves(occt, handle);
  const pieces = solids ?? [handle];
  const precise = occt.subShapeCount(handle, 'face') < EXACT_BOX_FACES;
  try {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const piece of pieces) {
      if (precise) alive(pieceBudgetMs(occt, piece));
      const box = occt.getBoundingBox(piece, { precise });
      min.x = Math.min(min.x, box.xmin);
      min.y = Math.min(min.y, box.ymin);
      min.z = Math.min(min.z, box.zmin);
      max.x = Math.max(max.x, box.xmax);
      max.y = Math.max(max.y, box.ymax);
      max.z = Math.max(max.z, box.zmax);
      alive();
    }
    return { min, max };
  } finally {
    if (solids !== null) for (const solid of solids) occt.release(solid);
  }
}
