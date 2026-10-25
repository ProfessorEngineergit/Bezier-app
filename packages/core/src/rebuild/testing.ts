/** Shared sketch and solver fixtures for the rebuild and cache test suites. */

import type { ConstraintSolver, Point2, Sketch, SketchId, SolveResult } from '@bezier/solver';
import type { FeatureRecord } from '../features/types.js';

/** A closed rectangle: four corners joined by four lines. */
export function rectangleSketch(): Sketch {
  const corners = ['p0', 'p1', 'p2', 'p3'];
  return {
    primitives: [
      ...corners.map((id) => ({ kind: 'point' as const, id, x: 0, y: 0 })),
      ...corners.map((id, i) => ({
        kind: 'line' as const,
        id: `l${i}`,
        start: id,
        end: corners[(i + 1) % corners.length] as SketchId,
      })),
    ],
    constraints: [],
  };
}

/**
 * A stub solver that always places the rectangle at the same size, so tests isolate naming and
 * caching. Real solving is tested in @bezier/solver.
 */
export function stubSolver(width = 40, height = 60): ConstraintSolver {
  const positions = new Map<SketchId, Point2>([
    ['p0', { x: 0, y: 0 }],
    ['p1', { x: width, y: 0 }],
    ['p2', { x: width, y: height }],
    ['p3', { x: 0, y: height }],
  ]);
  const result: SolveResult = {
    status: 'solved',
    positions,
    radii: new Map(),
    dof: 0,
    conflicting: [],
    redundant: [],
  };
  return { solve: () => result, dispose: () => {} };
}

export const testSketch: FeatureRecord = {
  id: 'sketch-1',
  type: 'sketch',
  name: 'Sketch',
  params: { plane: 'XY', sketch: rectangleSketch() },
};
