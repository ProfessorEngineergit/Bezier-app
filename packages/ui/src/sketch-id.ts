/** Deterministic ids for sketch primitives and constraints. */

import type { Sketch, SketchConstraint, SketchId, SketchPrimitive } from '@bezier/solver';

/** Mint an id without clocks or randomness so journal replay stays identical. */
export function nextSketchId(sketch: Sketch, prefix: string): string {
  const used = new Set<string>([
    ...sketch.primitives.map((primitive) => primitive.id),
    ...sketch.constraints.map((constraint) => constraint.id),
  ]);
  let index = sketch.primitives.length + sketch.constraints.length;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

/**
 * The primitives a constraint references, read generically from its fields so new constraint kinds
 * are covered. Deletes and trims rely on it: a constraint referencing a removed primitive makes the
 * solver reject the sketch.
 */
export function namedBy(constraint: SketchConstraint): SketchId[] {
  return Object.entries(constraint).flatMap(([key, value]) =>
    key !== 'id' && key !== 'kind' && typeof value === 'string' ? [value] : [],
  );
}

/** All points of an element: ends, centre, spline points. */
export function pointsOf(primitive: SketchPrimitive): SketchId[] {
  switch (primitive.kind) {
    case 'point':
      return [primitive.id];
    case 'line':
      return [primitive.start, primitive.end];
    case 'circle':
      return [primitive.center];
    case 'arc':
      return [primitive.center, primitive.start, primitive.end];
    case 'spline':
      return [...primitive.points];
    case 'ellipse':
      return [primitive.center, primitive.vertex];
  }
}
