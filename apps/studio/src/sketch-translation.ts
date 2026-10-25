import type { PlaneBasis } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
export function translatedSketch(
  sketch: Sketch,
  basis: PlaneBasis,
  delta: { x: number; y: number; z: number },
) {
  const dot = (axis: { x: number; y: number; z: number }) =>
    delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
  const du = dot(basis.xDirection),
    dv = dot(basis.yDirection);
  return {
    sketch: {
      primitives: sketch.primitives.map((p) =>
        p.kind === 'point' ? { ...p, x: p.x + du, y: p.y + dv } : p,
      ),
      constraints: sketch.constraints.map((c) =>
        c.kind === 'lock' ? { ...c, x: c.x + du, y: c.y + dv } : c,
      ),
    },
    offset: dot(basis.normal),
  };
}
