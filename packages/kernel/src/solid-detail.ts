/**
 * Some solids of a body meshed at their own setting, for level of detail in the viewport
 * (`packages/renderer/src/solid-lod.ts`). Solids are addressed by position in the body's mesh
 * (`Mesh.solidTriangles`). Always meshed on a copy (`meshPiece`'s `apart`), since a finer mesh left
 * on the shape blocks coarser ones, and cached separately so close-ups never evict the body's mesh.
 */

import {
  type Counted,
  edgesOfPiece,
  joinEdges,
  joinMeshes,
  MESH_HASH_UPPER_BOUND,
  meshPiece,
  type Piece,
  SolidCache,
  solidLeaves,
} from './tessellation.js';
import type { EdgeSet, Mesh, TessellationOptions } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/** Triangles plus vertices: some 60 MB. A close-up is a few solids at a time. */
export function detailMeshCache(): SolidCache<Counted<Piece>> {
  return new SolidCache(
    ({ value }) => value.indices.length / 3 + value.positions.length / 3,
    2_500_000,
  );
}

export function detailEdgeCache(): SolidCache<Counted<EdgeSet>> {
  return new SolidCache(({ value }) => value.positions.length / 3, 1_000_000);
}

/**
 * Each face's position in the last body asked about. Rehashing an assembly's 108,000 faces per
 * close-up would cost more than meshing the solid.
 */
let numbered: { body: number; positionOf: Map<number, number> } | null = null;

/** By the body's `ShapeId`, which is never handed out twice; a raw handle can be. */
function positionsIn(occt: RawKernel, handle: RawHandle, body: number): Map<number, number> {
  if (numbered?.body === body) return numbered.positionOf;
  const positionOf = new Map<number, number>();
  occt.subShapeHashes(handle, 'face', MESH_HASH_UPPER_BOUND).forEach((hash, index) => {
    positionOf.set(hash >>> 0, index);
  });
  numbered = { body, positionOf };
  return positionOf;
}

/**
 * The solids at `solids` of `handle`, each passed to `make` unless `cache` has it. A body that is
 * not a compound of solids is solid 0 and never cached (its handle is the body's own). Throws on a
 * position the body lacks, meaning the view asked about another body.
 */
function throughCache<T>(
  occt: RawKernel,
  handle: RawHandle,
  solids: readonly number[],
  cache: SolidCache<Counted<T>>,
  setting: string,
  make: (solid: RawHandle) => T,
  alive: () => void,
): T[] {
  const leaves = solidLeaves(occt, handle);
  if (leaves === null) {
    if (solids.some((at) => at !== 0)) throw new Error('The body has only one solid.');
    return solids.map(() => make(handle));
  }
  const wanted = new Set(solids);
  // Release unrequested leaves now; requested ones belong to the cache if it keeps them.
  leaves.forEach((leaf, at) => {
    if (!wanted.has(at)) occt.release(leaf);
  });
  const kept = new Set<number>();
  try {
    return solids.map((at) => {
      const solid = leaves[at];
      if (solid === undefined) throw new Error(`The body has no solid ${at}.`);
      const key = `${occt.hashCode(solid, MESH_HASH_UPPER_BOUND)}|${setting}`;
      const found = cache.take(occt, solid, key, () => ({ value: make(solid), count: 0 }));
      if (found.kept) kept.add(at);
      alive();
      return found.value.value;
    });
  } finally {
    for (const at of wanted) {
      const leaf = leaves[at];
      if (leaf !== undefined && !kept.has(at)) occt.release(leaf);
    }
  }
}

/**
 * The solids at `solids` of `handle`, meshed at `options`, in the order asked, with faces
 * numbered as in the body's own mesh and one run each in `solidTriangles`.
 */
export function meshOfSolids(
  occt: RawKernel,
  handle: RawHandle,
  body: number,
  solids: readonly number[],
  options: TessellationOptions,
  cache: SolidCache<Counted<Piece>>,
  alive: () => void = () => {},
): Mesh {
  const pieces = throughCache(
    occt,
    handle,
    solids,
    cache,
    `${options.linearDeflection}|${options.angularDeflection}`,
    (solid) => meshPiece(occt, solid, options, true),
    alive,
  );
  return joinMeshes(pieces, positionsIn(occt, handle, body));
}

/** The outlines of the solids at `solids`, at `options`, one run each in `solidLines`. */
export function edgesOfSolids(
  occt: RawKernel,
  handle: RawHandle,
  solids: readonly number[],
  options: TessellationOptions,
  cache: SolidCache<Counted<EdgeSet>>,
  alive: () => void = () => {},
): EdgeSet {
  const pieces = throughCache(
    occt,
    handle,
    solids,
    cache,
    `${options.linearDeflection}|${options.angularDeflection}`,
    (solid) => edgesOfPiece(occt, solid, options, true),
    alive,
  );
  return joinEdges(pieces);
}
