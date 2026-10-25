/**
 * Retries a tweak that would shrink a neighbouring face to nothing (a top pushed past a chamfer, a
 * wall pulled in past a round). The tweak cannot remove faces, so one small face bordering a moved
 * face is removed first (`defeatureWithHistory`), the move repeated, and one combined history
 * returned. Only a few faces smaller than the moved face are tried, smallest first.
 */
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type Handle = ReturnType<RawKernel['makeBox']>;
type Evolution = ReturnType<RawKernel['cutWithHistory']>;

/** How many faces are tried one by one before giving up. */
const TRIES = 4;

/** One move of whole faces, as the tweak takes it: a face and its 3×4 motion. */
export interface FaceMoves {
  faces: readonly Handle[];
  motions: readonly (readonly number[])[];
}

/** `[input, count, ...outputs]` runs, as occt-wasm writes `modified`. */
function decode(flat: readonly number[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  let i = 0;
  while (i + 1 < flat.length) {
    const count = flat[i + 1] ?? 0;
    out.set(flat[i] ?? 0, flat.slice(i + 2, i + 2 + count));
    i += 2 + count;
  }
  return out;
}

/** Two histories one after the other, as one, for the faces `hashes` of the first input. */
export function composed(
  first: Evolution,
  second: Evolution,
  hashes: readonly number[],
): Evolution {
  const a = decode(first.modified);
  const b = decode(second.modified);
  const goneA = new Set(first.deleted);
  const goneB = new Set(second.deleted);
  const through = (hash: number) => (goneB.has(hash) ? [] : (b.get(hash) ?? [hash]));
  const modified: number[] = [];
  const deleted: number[] = [];
  for (const hash of hashes) {
    if (goneA.has(hash)) {
      deleted.push(hash);
      continue;
    }
    const after = (a.get(hash) ?? [hash]).flatMap(through);
    if (after.length === 0) deleted.push(hash);
    else if (after.length !== 1 || after[0] !== hash) modified.push(hash, after.length, ...after);
  }
  return { ...second, modified, generated: [], deleted };
}

/** The faces of `body` that share an edge with `face`. */
function bordering(kernel: RawKernel, faces: readonly Handle[], face: Handle): number[] {
  const edges = kernel.getSubShapes(face, 'edge');
  try {
    const out: number[] = [];
    faces.forEach((other, i) => {
      if (kernel.isSame(other, face)) return;
      const theirs = kernel.getSubShapes(other, 'edge');
      if (theirs.some((e) => edges.some((f) => kernel.isSame(e, f)))) out.push(i);
      for (const e of theirs) kernel.release(e);
    });
    return out;
  } finally {
    for (const e of edges) kernel.release(e);
  }
}

/**
 * The move with one small bordering face taken away first, or null when no such face makes it
 * work. `moves.faces` are faces of `body`.
 */
export function withoutVanishingFace(
  kernel: RawKernel,
  body: Handle,
  all: readonly Handle[],
  moves: FaceMoves,
  hashes: readonly number[],
  bound: number,
): Evolution | null {
  const moved = new Set<number>();
  for (const face of moves.faces) {
    const at = all.findIndex((f) => kernel.isSame(f, face));
    if (at >= 0) moved.add(at);
  }
  const area = (i: number) => kernel.getSurfaceArea(all[i] as Handle);
  const candidates = new Map<number, number>();
  for (const face of moves.faces) {
    const own = kernel.getSurfaceArea(face);
    for (const i of bordering(kernel, all, face)) {
      if (moved.has(i)) continue;
      const size = area(i);
      if (size < own) candidates.set(i, size);
    }
  }
  const tried = [...candidates.entries()].sort((x, y) => x[1] - y[1]).slice(0, TRIES);
  for (const [i] of tried) {
    let removed: Evolution;
    try {
      removed = kernel.defeatureWithHistory(body, [all[i] as Handle], [...hashes], bound);
    } catch {
      continue;
    }
    try {
      const after = decode(removed.modified);
      const goneFaces = new Set(removed.deleted);
      const remaining = kernel.getSubShapes(removed.result, 'face');
      try {
        const byHash = new Map(remaining.map((f) => [kernel.hashCode(f, bound), f] as const));
        const faces: Handle[] = [];
        const motions: (readonly number[])[] = [];
        moves.faces.forEach((face, k) => {
          const hash = kernel.hashCode(face, bound);
          if (goneFaces.has(hash)) return;
          for (const next of after.get(hash) ?? [hash]) {
            const found = byHash.get(next);
            if (found === undefined) continue;
            faces.push(found);
            motions.push(moves.motions[k] ?? []);
          }
        });
        if (faces.length === 0) continue;
        const middle = remaining.map((f) => kernel.hashCode(f, bound));
        const moved = kernel.tweakFacesWithHistory(
          removed.result,
          faces,
          flatMotions(motions),
          faces.map(() => 0),
          middle,
          bound,
        );
        return composed(removed, moved, hashes);
      } catch {
        // This face was not the one in the way; the next is tried.
      } finally {
        for (const f of remaining) kernel.release(f);
      }
    } finally {
      kernel.release(removed.result);
    }
  }
  return null;
}

/**
 * The motions as the kernel reads them: twelve numbers a face, or twenty-four for all when any face
 * is ruled between two segments (`tweak-parts.ts`), the others then padded with NaN.
 */
export function flatMotions(motions: readonly (readonly number[])[]): number[] {
  const ruled = motions.some((m) => m.length === 24);
  return motions.flatMap((m) =>
    ruled && m.length === 12 ? [...m, ...new Array<number>(12).fill(Number.NaN)] : [...m],
  );
}
