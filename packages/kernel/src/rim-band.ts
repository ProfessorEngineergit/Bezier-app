/**
 * A band along the inside of a flat rim, for a lip or a groove: the rim's hole, grown outward into
 * the wall by a width, and pushed along the face's normal.
 */

import { JoinType } from 'occt-wasm';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type Handle = ReturnType<RawKernel['makeBox']>;

const across = (occt: RawKernel, wire: Handle) => {
  const box = occt.getBoundingBox(wire, { precise: false });
  return Math.hypot(box.xmax - box.xmin, box.ymax - box.ymin, box.zmax - box.zmin);
};

export function rimBand(
  occt: RawKernel,
  rim: Handle,
  normal: { x: number; y: number; z: number },
  width: number,
  distance: number,
): Handle {
  const wires = occt.getSubShapes(rim, 'wire');
  const outer = occt.outerWire(rim);
  const outerSize = across(occt, outer);
  const holes = wires.filter((wire) => across(occt, wire) < outerSize - 1e-6);
  const [hole] = holes;
  if (hole === undefined || holes.length !== 1) {
    throw new Error('A rim is a flat face with one opening in it.');
  }
  // Which way a wire offsets depends on how it runs, so the larger answer is the one out of the hole.
  const one = occt.offsetWire2D(hole, width, JoinType.Intersection);
  const other = occt.offsetWire2D(hole, -width, JoinType.Intersection);
  const grown = across(occt, one) > across(occt, other) ? one : other;
  const band = occt.addHolesInFace(occt.makeFace(grown), [hole]);
  return occt.extrude(band, normal.x * distance, normal.y * distance, normal.z * distance);
}

const middle = (occt: RawKernel, shape: Handle) => {
  const box = occt.getBoundingBox(shape, { precise: false });
  return {
    x: (box.xmin + box.xmax) / 2,
    y: (box.ymin + box.ymax) / 2,
    z: (box.zmin + box.zmax) / 2,
  };
};

/** The face of `shape` that lies where `face` lay before `shape` was changed. */
export function nearestFace(occt: RawKernel, shape: Handle, face: Handle): Handle {
  const was = middle(occt, face);
  let best: Handle | null = null;
  let closest = Number.POSITIVE_INFINITY;
  for (const candidate of occt.getSubShapes(shape, 'face')) {
    const at = middle(occt, candidate);
    const distance = Math.hypot(at.x - was.x, at.y - was.y, at.z - was.z);
    if (distance < closest) {
      closest = distance;
      best = candidate;
    }
  }
  if (best === null) throw new Error('The solid has no faces.');
  return best;
}
