/** Where a picture's plane is in the world: the named plane, moved along its normal by the offset. */

import { type PlaneBasis, planeBasis } from '@bezier/core';

const PLANES = new Set(['XY', 'XZ', 'YZ']);

export function imageBasis(params: Readonly<Record<string, unknown>>): PlaneBasis | null {
  const plane = typeof params.plane === 'string' && PLANES.has(params.plane) ? params.plane : 'XY';
  const flat = planeBasis(plane);
  if (flat === null) return null;
  const offset =
    typeof params.offset === 'number' && Number.isFinite(params.offset) ? params.offset : 0;
  return {
    ...flat,
    origin: {
      x: flat.origin.x + flat.normal.x * offset,
      y: flat.origin.y + flat.normal.y * offset,
      z: flat.origin.z + flat.normal.z * offset,
    },
  };
}
