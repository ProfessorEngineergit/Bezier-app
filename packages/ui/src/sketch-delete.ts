import type { Sketch, SketchConstraint, SketchId, SketchPrimitive } from '@bezier/solver';
import { namedBy, pointsOf } from './sketch-id.js';

/** Delete selected sketch primitives, their constraints, and points left unused. */
export function deleteSketchPrimitives(sketch: Sketch, picked: ReadonlySet<SketchId>): Sketch {
  if (picked.size === 0) return sketch;
  // A picked point removes what depends on it: a line without one of its ends is invalid.
  const selected = new Set<SketchId>(picked);
  for (const primitive of sketch.primitives)
    if (primitive.kind !== 'point' && endsOf(primitive).some((id) => picked.has(id)))
      selected.add(primitive.id);

  const keptGeometry = sketch.primitives.filter(
    (primitive) =>
      (primitive.kind === 'point' && !picked.has(primitive.id)) ||
      (primitive.kind !== 'point' && !selected.has(primitive.id)),
  );
  const usedPoints = new Set<SketchId>();
  for (const primitive of keptGeometry)
    if (primitive.kind !== 'point') for (const id of pointsOf(primitive)) usedPoints.add(id);

  const removed = new Set<SketchId>(selected);
  const primitives = keptGeometry.filter((primitive) => {
    if (primitive.kind !== 'point' || usedPoints.has(primitive.id)) return true;
    removed.add(primitive.id);
    return false;
  });
  const constraints = sketch.constraints.filter(
    (constraint) => !constraintTouches(constraint, removed),
  );

  return { primitives, constraints };
}

function constraintTouches(constraint: SketchConstraint, removed: ReadonlySet<SketchId>): boolean {
  return namedBy(constraint).some((id) => removed.has(id));
}

function endsOf(primitive: Exclude<SketchPrimitive, { kind: 'point' }>): SketchId[] {
  return pointsOf(primitive);
}
