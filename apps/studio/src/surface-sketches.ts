/**
 * Imports a STEP file of loose surfaces as sketches (audit F-017). Such a file has no solid; each
 * flat face becomes a sketch of its outline on the face's plane (an origin plane tilted and offset
 * to it), typically sections to loft or outlines to extrude.
 */
import { leanedBasis, type Operation, planeBasis, planeFacing } from '@bezier/core';
import type { FaceOutline } from '@bezier/kernel';
import type { SketchPrimitive } from '@bezier/solver';

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  a.x * b.x + a.y * b.y + a.z * b.z;

/** One `addFeature` per flat face, named after the file, starting at `index`. */
export function outlinesAsSketches(
  outlines: readonly FaceOutline[],
  name: string,
  index: number,
  stamp = Date.now(),
): Operation[] {
  return outlines.flatMap((outline, n) => {
    const facing = planeFacing(outline.normal);
    const rest = planeBasis(facing.plane);
    if (rest === null) return [];
    const offset = dot(outline.origin, outline.normal);
    const basis = leanedBasis(rest, { ...facing.lean, offset });
    const primitives: SketchPrimitive[] = [];
    outline.loops.forEach((loop, l) => {
      const ids = loop.map((point, p) => {
        const id = `p${l}-${p}`;
        const from = {
          x: point.x - basis.origin.x,
          y: point.y - basis.origin.y,
          z: point.z - basis.origin.z,
        };
        primitives.push({
          kind: 'point',
          id,
          x: dot(from, basis.xDirection),
          y: dot(from, basis.yDirection),
        });
        return id;
      });
      ids.forEach((id, p) => {
        const next = ids[(p + 1) % ids.length];
        if (next !== undefined)
          primitives.push({ kind: 'line', id: `l${l}-${p}`, start: id, end: next });
      });
    });
    return [
      {
        op: 'addFeature',
        id: `sketch-${stamp}-${n}`,
        type: 'sketch',
        name: outlines.length === 1 ? name : `${name} ${n + 1}`,
        index: index + n,
        params: {
          plane: facing.plane,
          offset,
          tilt: facing.lean.tilt,
          turn: facing.lean.turn,
          sketch: { primitives, constraints: [] },
        },
      } satisfies Operation,
    ];
  });
}
