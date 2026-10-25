/** Follow a boolean's planar fragments through local same-domain refinement. */
import type { loadOcct } from './wasm.js';

type Raw = Awaited<ReturnType<typeof loadOcct>>;
type Evolution = ReturnType<Raw['cutWithHistory']>;

/**
 * Refining removes the artificial ring left by fusing an annular sleeve, and the seam left where a
 * wall is pulled further out. The binding exposes no refinement history, so only this operation's
 * fragments are matched, by lying on the same kind of surface and overlapping; this is not a
 * persisted geometric identity or a fallback across document rebuilds.
 */
export function refineHistory(
  kernel: Raw,
  evolution: Evolution,
  input: readonly number[],
  bound: number,
): Evolution {
  const result = kernel.unifySameDomain(evolution.result);
  const before = kernel.getSubShapes(evolution.result, 'face');
  const after = kernel.getSubShapes(result, 'face');
  let kept = false;
  try {
    const byHash = new Map(after.map((face) => [kernel.hashCode(face, bound), face]));
    const follows = new Map<number, number>();
    for (const face of before) {
      const hash = kernel.hashCode(face, bound);
      if (byHash.has(hash)) {
        follows.set(hash, hash);
        continue;
      }
      // The face it became lies on the same surface and covers it. For a plane the normal is a
      // cheap first sieve; for a cylinder or any other surface the kind of surface is, and the
      // overlap decides either way.
      const kind = kernel.surfaceType(face);
      const flat = kind === 'plane';
      const uv = kernel.uvBounds(face);
      const normal = flat ? kernel.surfaceNormal(face, uv.uMin, uv.vMin) : null;
      const matches: number[] = [];
      for (const [name, candidate] of byHash) {
        if (kernel.surfaceType(candidate) !== kind) continue;
        if (normal !== null) {
          const uv2 = kernel.uvBounds(candidate);
          const n = kernel.surfaceNormal(candidate, uv2.uMin, uv2.vMin);
          if (normal.x * n.x + normal.y * n.y + normal.z * n.z < 1 - 1e-7) continue;
        }
        const common = kernel.common(face, candidate);
        try {
          if (kernel.getSurfaceArea(common) > 1e-8) matches.push(name);
        } finally {
          kernel.release(common);
        }
      }
      if (matches.length !== 1)
        throw new Error('The refined face could not be followed unambiguously.');
      follows.set(hash, matches[0] ?? 0);
    }
    const modified: number[] = [];
    const touched = new Set(evolution.deleted);
    for (let i = 0; i + 1 < evolution.modified.length; ) {
      const from = evolution.modified[i] ?? 0,
        count = evolution.modified[i + 1] ?? 0;
      const to = [
        ...new Set(
          evolution.modified.slice(i + 2, i + 2 + count).map((hash) => follows.get(hash) ?? hash),
        ),
      ];
      modified.push(from, to.length, ...to);
      touched.add(from);
      i += 2 + count;
    }
    for (const from of input) {
      const to = follows.get(from);
      if (!touched.has(from) && to !== undefined && to !== from) modified.push(from, 1, to);
    }
    kept = true;
    return { ...evolution, result, modified };
  } finally {
    for (const face of [...before, ...after]) kernel.release(face);
    if (!kept) kernel.release(result);
  }
}

/**
 * A union with its seams removed, or the union as made when the merged faces cannot be traced back.
 * A wall pulled further out shares its surface with the wall it grew from, leaving an edge where
 * they meet. Removing it is best-effort: a leftover seam is harmless, a refused pull is not.
 */
export function mergedOrAsMade(
  kernel: Raw,
  evolution: Evolution,
  input: readonly number[],
  bound: number,
  wanted = true,
): Evolution {
  if (!wanted) return evolution;
  try {
    const merged = refineHistory(kernel, evolution, input, bound);
    if (!kernel.isValid(merged.result)) {
      kernel.release(merged.result);
      return evolution;
    }
    kernel.release(evolution.result);
    return merged;
  } catch {
    return evolution;
  }
}

/** Why a boolean was refused: between two shapes, and between two bodies by kind. */
export const COMBINE_REFUSED = {
  shapes: 'These two shapes could not be combined.',
  fuse: 'These bodies could not be joined.',
  cut: 'The tool bodies could not be cut away from this body.',
  intersect: 'These bodies could not be intersected. Check that they overlap.',
} as const;
