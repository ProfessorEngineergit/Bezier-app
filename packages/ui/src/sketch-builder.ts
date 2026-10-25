/**
 * Builds sketch geometry from user input; pure, no React or solver. The result is stored in a
 * feature's `sketch` parameter. Shapes include the constraints that keep them intact when
 * dimensions change. Ids derive from a caller-supplied prefix, not a counter or random value, so
 * replay is deterministic (ADR 0009).
 */

import type { Sketch, SketchConstraint, SketchId, SketchPrimitive } from '@bezier/solver';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A closed, constrained rectangle. Corners run anticlockwise from the lower left, so `side-0` is
 * the bottom edge. This order reaches the face tags of an extrude, which are a compatibility
 * promise (`docs/contributing/conventions.md`).
 */
export function rectangleSketch(prefix: string, rect: Rect): Sketch {
  const { x, y, width, height } = rect;
  const corners: Array<[number, number]> = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];

  const points: SketchPrimitive[] = corners.map(([px, py], i) => ({
    kind: 'point',
    id: `${prefix}-p${i}`,
    x: px,
    y: py,
  }));

  const lines: SketchPrimitive[] = corners.map((_, i) => ({
    kind: 'line',
    id: `${prefix}-l${i}`,
    start: `${prefix}-p${i}`,
    end: `${prefix}-p${(i + 1) % corners.length}`,
  }));

  const constraints: SketchConstraint[] = [
    // Bottom and top along x, sides along y.
    { kind: 'horizontal', id: `${prefix}-h0`, line: `${prefix}-l0` },
    { kind: 'horizontal', id: `${prefix}-h1`, line: `${prefix}-l2` },
    { kind: 'vertical', id: `${prefix}-v0`, line: `${prefix}-l1` },
    { kind: 'vertical', id: `${prefix}-v1`, line: `${prefix}-l3` },
  ];

  return { primitives: [...points, ...lines], constraints };
}

/** A single unconstrained line between two new points. */
export function lineSketch(prefix: string, from: [number, number], to: [number, number]): Sketch {
  return {
    primitives: [
      { kind: 'point', id: `${prefix}-a`, x: from[0], y: from[1] },
      { kind: 'point', id: `${prefix}-b`, x: to[0], y: to[1] },
      { kind: 'line', id: `${prefix}-l`, start: `${prefix}-a`, end: `${prefix}-b` },
    ],
    constraints: [],
  };
}

/**
 * Locks a point in place. Without one fixed point the whole sketch can slide, which the solver
 * reports as remaining degrees of freedom.
 */
export function lockPoint(id: SketchId, point: SketchId, x: number, y: number): SketchConstraint {
  return { kind: 'lock', id, point, x, y };
}

/** A driving dimension between two points, in millimetres. */
export function distanceBetween(
  id: SketchId,
  a: SketchId,
  b: SketchId,
  value: number,
): SketchConstraint {
  return { kind: 'distance', id, a, b, value };
}

/**
 * Adds primitives and constraints, throwing on a duplicate id. Duplicate ids make the solver
 * silently constrain the wrong element, so they are checked explicitly.
 */
export function addToSketch(
  sketch: Sketch,
  primitives: readonly SketchPrimitive[],
  constraints: readonly SketchConstraint[] = [],
): Sketch {
  const taken = new Set<SketchId>([
    ...sketch.primitives.map((p) => p.id),
    ...sketch.constraints.map((c) => c.id),
  ]);

  for (const entry of [...primitives, ...constraints]) {
    if (taken.has(entry.id)) throw new Error(`sketch already contains an id "${entry.id}"`);
    taken.add(entry.id);
  }

  return {
    primitives: [...sketch.primitives, ...primitives],
    constraints: [...sketch.constraints, ...constraints],
  };
}
