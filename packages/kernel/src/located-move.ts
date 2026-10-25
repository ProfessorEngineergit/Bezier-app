/**
 * Moves a shape by its location instead of copying it. `located` shares the topology, so a move is
 * O(1); copying the Voron assembly took 5 s and lost its kept meshes (`kept-displays.ts`).
 */

import type { EvolutionData, FaceHash, Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/**
 * `shape` moved by `by`, with each face mapped to its moved counterpart (a located shape lists its
 * faces in the original's order). Null when the lists do not line up; the caller then copies.
 */
export function locatedMove(
  occt: RawKernel,
  shape: RawHandle,
  by: Vec3,
  hashesOf: (shape: RawHandle) => readonly FaceHash[],
): { moved: RawHandle; evolution: EvolutionData } | null {
  const before = hashesOf(shape);
  const moved = occt.located(shape, [1, 0, 0, by.x, 0, 1, 0, by.y, 0, 0, 1, by.z]);
  const after = hashesOf(moved);
  if (after.length !== before.length) {
    occt.release(moved);
    return null;
  }
  const modified: EvolutionData['modified'][number][] = [];
  const unchanged: FaceHash[] = [];
  before.forEach((from, i) => {
    const to = after[i] as FaceHash;
    if (to === from) unchanged.push(from);
    else modified.push({ from, to: [to] });
  });
  return { moved, evolution: { modified, generated: [], deleted: [], unchanged } };
}
