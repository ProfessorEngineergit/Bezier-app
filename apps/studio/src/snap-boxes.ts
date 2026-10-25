/**
 * Boxes for move snapping (`move-snap.ts`), from the displayed model: one per body, from its drawn
 * faces, plus one for the selection.
 */

import { formatRef, type StableRef } from '@bezier/core';
import type { Box } from './move-snap.js';

/** The display data needed: mesh, triangle-to-face map and the bodies' faces. */
export interface SnapSource {
  mesh: {
    positions: Float32Array;
    indices: Uint32Array;
    triangleFaces: Uint32Array;
  };
  faceRefs: readonly (StableRef | null)[];
  bodyRefs?: readonly (readonly StableRef[])[] | undefined;
}

export interface SnapBoxes {
  /** The selected bodies combined, or null when no body is selected. */
  moving: Box | null;
  /** Every other displayed body, in `names` order. */
  others: Box[];
  names: string[];
}

function union(a: Box | null, b: Box): Box {
  if (a === null) return b;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

/**
 * Every face's box as six numbers (min xyz, max xyz), indexed like `faceRefs`; faces without
 * triangles keep +Infinity. One flat array: two arrays per triangle meant 5 million allocations for
 * the Voron after every move.
 */
function faceExtents(source: SnapSource): Float64Array {
  const { positions, indices, triangleFaces } = source.mesh;
  const faces = Math.max(source.faceRefs.length, 0);
  const extents = new Float64Array(faces * 6);
  for (let f = 0; f < faces; f++) {
    extents.fill(Number.POSITIVE_INFINITY, f * 6, f * 6 + 3);
    extents.fill(Number.NEGATIVE_INFINITY, f * 6 + 3, f * 6 + 6);
  }
  const triangles = triangleFaces.length;
  for (let t = 0; t < triangles; t++) {
    const face = triangleFaces[t] ?? faces;
    if (face >= faces) continue;
    const at = face * 6;
    for (let k = 0; k < 3; k++) {
      const v = (indices[t * 3 + k] ?? 0) * 3;
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[v + axis] ?? 0;
        if (value < (extents[at + axis] ?? 0)) extents[at + axis] = value;
        if (value > (extents[at + 3 + axis] ?? 0)) extents[at + 3 + axis] = value;
      }
    }
  }
  return extents;
}

function boxAt(extents: Float64Array, face: number): Box | null {
  const at = face * 6;
  if (!((extents[at] ?? Number.POSITIVE_INFINITY) <= (extents[at + 3] ?? 0))) return null;
  return {
    min: [extents[at] ?? 0, extents[at + 1] ?? 0, extents[at + 2] ?? 0],
    max: [extents[at + 3] ?? 0, extents[at + 4] ?? 0, extents[at + 5] ?? 0],
  };
}

/** Every face's box, indexed like `faceRefs`. */
export function faceBoxes(source: SnapSource): Map<number, Box> {
  const extents = faceExtents(source);
  const boxes = new Map<number, Box>();
  for (let face = 0; face < source.faceRefs.length; face++) {
    const box = boxAt(extents, face);
    if (box !== null) boxes.set(face, box);
  }
  return boxes;
}

/**
 * The selected bodies as one box and the others separately. A body is selected when any of its
 * faces is. Faces are matched by reference identity first and by formatted text only as a fallback;
 * formatting every name cost about a third of a second per move on the Voron.
 */
export function snapBoxes(
  source: SnapSource | null,
  selected: readonly StableRef[],
  nameOf: (face: StableRef) => string | null,
): SnapBoxes {
  if (source === null || source.bodyRefs === undefined)
    return { moving: null, others: [], names: [] };
  const extents = faceExtents(source);
  const byRef = new Map<StableRef, number>();
  source.faceRefs.forEach((ref, index) => {
    if (ref !== null) byRef.set(ref, index);
  });
  let byText: Map<string, number> | null = null;
  const indexOf = (ref: StableRef): number | undefined => {
    const same = byRef.get(ref);
    if (same !== undefined) return same;
    if (byText === null) {
      const made = new Map<string, number>();
      source.faceRefs.forEach((face, index) => {
        if (face !== null) made.set(formatRef(face), index);
      });
      byText = made;
    }
    return byText.get(formatRef(ref));
  };
  const picked = new Set<number>();
  for (const ref of selected) {
    const index = indexOf(ref);
    if (index !== undefined) picked.add(index);
  }
  let moving: Box | null = null;
  const others: Box[] = [];
  const names: string[] = [];
  for (const body of source.bodyRefs) {
    let box: Box | null = null;
    let isPicked = false;
    for (const face of body) {
      const index = indexOf(face);
      if (index === undefined) continue;
      if (picked.has(index)) isPicked = true;
      const found = boxAt(extents, index);
      if (found !== null) box = union(box, found);
    }
    if (box === null) continue;
    if (isPicked) moving = union(moving, box);
    else {
      others.push(box);
      names.push(body[0] === undefined ? 'another body' : (nameOf(body[0]) ?? 'another body'));
    }
  }
  return { moving, others, names };
}
