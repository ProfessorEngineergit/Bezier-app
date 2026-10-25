/**
 * @bezier/solver: wraps planegcs (FreeCAD's 2D constraint solver, as WebAssembly) behind typed
 * sketches. See docs/adr/0002-constraint-solver.md.
 */

export type {
  Point2,
  Sketch,
  SketchArc,
  SketchCircle,
  SketchConstraint,
  SketchEllipse,
  SketchId,
  SketchLine,
  SketchPoint,
  SketchPrimitive,
  SketchSpline,
  SolveResult,
  SolveStatus,
} from './types.js';
export type { PlanegcsLoadOptions } from './wasm.js';
export { loadPlanegcs } from './wasm.js';

import { createGcsSolver } from './gcs-solver.js';
import type { Sketch, SketchId, SolveResult } from './types.js';
import { loadPlanegcs } from './wasm.js';

export interface ConstraintSolver {
  /**
   * Solves a sketch, starting from its current positions. The start decides which of several
   * valid solutions is found, which keeps dragging continuous.
   */
  solve(sketch: Sketch): SolveResult;

  /** Returns the ids of fully constrained elements. Optional. */
  determined?(sketch: Sketch): ReadonlySet<SketchId>;

  /** Frees this instance's WebAssembly resources. */
  dispose(): void;
}

export interface SolverOptions {
  /** URL of `planegcs.wasm`. Configurable for LGPL relinking (ADR 0003). */
  wasmUrl?: string;
}

/** Loads the solver. It is small (496 KB) and fast, so it runs on the main thread. */
export async function createSolver(options?: SolverOptions): Promise<ConstraintSolver> {
  const gcs = await loadPlanegcs(options);
  return createGcsSolver(gcs);
}
