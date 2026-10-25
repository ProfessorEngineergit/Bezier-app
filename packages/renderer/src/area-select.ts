/**
 * The faces a dragged rectangle takes: all of each face inside it (`window`), or any face it
 * touches (`crossing`), as the two drag directions of an area selection do in most CAD programs.
 */

import type { StableRef } from '@bezier/core';
import type { Mesh } from '@bezier/kernel';

export function facesInRect(
  mesh: Mesh,
  faceRefs: readonly (StableRef | null)[],
  project: (x: number, y: number, z: number) => { x: number; y: number } | null,
  { x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number },
  mode: 'window' | 'crossing',
): readonly StableRef[] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const { positions, indices, triangleFaces } = mesh;
  // One projection per vertex, not per triangle corner: most vertices are shared, and this runs
  // once per drag, on release.
  const inside = new Uint8Array(positions.length / 3);
  for (let v = 0; v < inside.length; v++) {
    const at = project(positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0);
    inside[v] =
      at !== null && at.x >= left && at.x <= right && at.y >= top && at.y <= bottom ? 1 : 0;
  }
  const all = new Map<number, boolean>();
  for (let t = 0; t < triangleFaces.length; t++) {
    const face = triangleFaces[t] ?? 0;
    let triangleIn = mode === 'window';
    for (let corner = 0; corner < 3; corner++) {
      const hit = inside[indices[t * 3 + corner] ?? 0] === 1;
      triangleIn = mode === 'window' ? triangleIn && hit : triangleIn || hit;
    }
    const sofar = all.get(face);
    all.set(
      face,
      sofar === undefined
        ? triangleIn
        : mode === 'window'
          ? sofar && triangleIn
          : sofar || triangleIn,
    );
  }
  const refs: StableRef[] = [];
  for (const [face, taken] of all) {
    const ref = faceRefs[face];
    if (taken && ref != null) refs.push(ref);
  }
  return refs;
}
