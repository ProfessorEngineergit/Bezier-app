/**
 * The plane a sketch started from the view lies on: a cube side's plane in a square view, or a
 * plane leaning to face the view on a view cube edge or corner.
 */

import { planeFacing } from '@bezier/core';
import type { CubeSide } from './scene.js';
import type { ViewPlane } from './viewport-api.js';

/**
 * The sides' own normals, not the camera's view directions: the top view is slightly off vertical
 * (`VIEW_DIRECTIONS` in scene.ts), which would tip a choice between two planes.
 */
const SIDE_NORMALS: Record<CubeSide, readonly [number, number, number]> = {
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  front: [0, -1, 0],
  back: [0, 1, 0],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

/** The plane facing the view between these sides, or squarely the one side's plane. */
export function planeBetween(sides: readonly CubeSide[]): ViewPlane {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const side of sides) {
    const [sx, sy, sz] = SIDE_NORMALS[side];
    x += sx;
    y += sy;
    z += sz;
  }
  return planeFacing({ x, y, z });
}

/**
 * The plane after a quarter turn about the vertical: a side plane becomes the other side, the top
 * stays, and a leaning plane is dropped.
 */
export function planeSpun(previous: ViewPlane | null): ViewPlane | null {
  if (previous === null || previous.lean.tilt !== 0 || previous.lean.turn !== 0) return null;
  if (previous.plane === 'XY') return previous;
  return { plane: previous.plane === 'XZ' ? 'YZ' : 'XZ', lean: previous.lean };
}
