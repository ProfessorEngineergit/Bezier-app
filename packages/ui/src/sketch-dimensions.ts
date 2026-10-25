import type { Sketch, SketchId, SketchLine } from '@bezier/solver';
import { positionOf } from './sketch-tools.js';

/** The current length of a sketch line, or null when its geometry is incomplete. */
export function lineLength(sketch: Sketch, id: SketchId): number | null {
  const line = sketch.primitives.find(
    (primitive): primitive is SketchLine => primitive.kind === 'line' && primitive.id === id,
  );
  if (line === undefined) return null;
  const start = positionOf(sketch, line.start);
  const end = positionOf(sketch, line.end);
  return start === null || end === null ? null : Math.hypot(end.u - start.u, end.v - start.v);
}

/** Set a line length immediately and persist the value as a distance constraint. */
export function setLineLength(sketch: Sketch, id: SketchId, length: number): Sketch {
  if (!Number.isFinite(length) || length <= 0) return sketch;
  const line = sketch.primitives.find(
    (primitive): primitive is SketchLine => primitive.kind === 'line' && primitive.id === id,
  );
  if (line === undefined) return sketch;
  const start = positionOf(sketch, line.start);
  const end = positionOf(sketch, line.end);
  if (start === null || end === null) return sketch;
  const current = Math.hypot(end.u - start.u, end.v - start.v);
  if (current < 1e-9) return sketch;

  const scale = length / current;
  const nextEnd = {
    u: start.u + (end.u - start.u) * scale,
    v: start.v + (end.v - start.v) * scale,
  };
  const axis = sketch.constraints.find(
    (constraint) =>
      (constraint.kind === 'horizontal' || constraint.kind === 'vertical') &&
      constraint.line === line.id,
  );
  const primitives = sketch.primitives.map((primitive) =>
    primitive.kind === 'point' &&
    (primitive.id === line.end ||
      (axis?.kind === 'horizontal' && Math.abs(primitive.x - end.u) < 1e-9) ||
      (axis?.kind === 'vertical' && Math.abs(primitive.y - end.v) < 1e-9))
      ? {
          ...primitive,
          x: axis?.kind === 'vertical' ? primitive.x : nextEnd.u,
          y: axis?.kind === 'horizontal' ? primitive.y : nextEnd.v,
        }
      : primitive,
  );
  const existing = sketch.constraints.findIndex(
    (constraint) =>
      constraint.kind === 'distance' &&
      ((constraint.a === line.start && constraint.b === line.end) ||
        (constraint.a === line.end && constraint.b === line.start)),
  );
  const constraints = [...sketch.constraints];
  if (existing >= 0) {
    const constraint = constraints[existing];
    if (constraint !== undefined && constraint.kind === 'distance') {
      constraints[existing] = { ...constraint, value: length };
    }
  } else {
    constraints.push({
      kind: 'distance',
      id: nextConstraintId(sketch),
      a: line.start,
      b: line.end,
      value: length,
    });
  }
  return { primitives, constraints };
}

function nextConstraintId(sketch: Sketch): SketchId {
  const used = new Set(sketch.constraints.map((constraint) => constraint.id));
  let index = sketch.constraints.length;
  while (used.has(`d${index}`)) index += 1;
  return `d${index}`;
}
