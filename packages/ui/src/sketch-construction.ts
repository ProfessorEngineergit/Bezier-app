/**
 * Construction geometry: lines and curves that guide a sketch without being part of any outline,
 * such as a centerline to mirror about or a circle to place holes on. The areas a sketch offers for
 * extruding ignore them (`regions-curves.ts` in `@bezier/core`); the drawing shows them dashed.
 */

import type { Sketch, SketchId, SketchPrimitive } from '@bezier/solver';

type Curve = Exclude<SketchPrimitive, { kind: 'point' }>;

const isCurve = (primitive: SketchPrimitive): primitive is Curve => primitive.kind !== 'point';

function withConstruction(primitive: Curve, on: boolean): Curve {
  if (on) return { ...primitive, construction: true };
  // No key and not `false`, so a toggled-back line is identical to one never toggled.
  const { construction: _off, ...rest } = primitive;
  return rest as Curve;
}

/**
 * Turn the selected lines and curves into construction geometry, or back. All become construction
 * unless every one already is, as a Bold button treats a mixed selection.
 */
export function toggleConstruction(sketch: Sketch, selected: readonly SketchId[]): Sketch {
  const picked = new Set(selected);
  const curves = sketch.primitives.filter(
    (primitive): primitive is Curve => isCurve(primitive) && picked.has(primitive.id),
  );
  if (curves.length === 0) return sketch;
  const on = !curves.every((curve) => curve.construction === true);
  return {
    ...sketch,
    primitives: sketch.primitives.map((primitive) =>
      isCurve(primitive) && picked.has(primitive.id) ? withConstruction(primitive, on) : primitive,
    ),
  };
}

/** Mark as construction every line or curve in `next` that `previous` did not have. */
export function markNewAsConstruction(previous: Sketch, next: Sketch): Sketch {
  const before = new Set(previous.primitives.map((primitive) => primitive.id));
  let changed = false;
  const primitives = next.primitives.map((primitive) => {
    if (!isCurve(primitive) || before.has(primitive.id) || primitive.construction === true) {
      return primitive;
    }
    changed = true;
    return withConstruction(primitive, true);
  });
  return changed ? { ...next, primitives } : next;
}
