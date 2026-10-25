/**
 * Stand-in constraint solver for when the real one cannot load (WebAssembly refused or not served).
 * Without a solver nothing downstream runs (profiles, solids, meshes, picking), so this keeps
 * projects usable: every point stays where it was drawn and constraints are ignored.
 *
 * It reports `under-constrained`, never `solved`, which the UI reads to warn the user.
 * `loadSolver()` falls back to it only when the real solver throws.
 */

import type { ConstraintSolver, Point2, Sketch, SketchId, SolveResult } from '@bezier/solver';
import { createSolver } from '@bezier/solver';

/** Every stand-in created, so the sketch tools can detect one. */
const standIns = new WeakSet<ConstraintSolver>();

/**
 * Whether this is the stand-in. The constraint tools use it to say a constraint is stored but not
 * enforced yet.
 */
export function isPlaceholderSolver(solver: ConstraintSolver): boolean {
  return standIns.has(solver);
}

export function placeholderSolver(): ConstraintSolver {
  const solver: ConstraintSolver = {
    solve(sketch: Sketch): SolveResult {
      const positions = new Map<SketchId, Point2>();
      const radii = new Map<SketchId, number>();

      for (const primitive of sketch.primitives) {
        if (primitive.kind === 'point') {
          positions.set(primitive.id, { x: primitive.x, y: primitive.y });
        } else if (primitive.kind === 'circle') {
          radii.set(primitive.id, primitive.radius);
        }
      }

      return {
        // Every point is free; reporting the real count keeps sketch diagnostics right.
        status: 'under-constrained',
        positions,
        radii,
        dof: positions.size * 2,
        conflicting: [],
        redundant: [],
      };
    },

    dispose() {
      // No WebAssembly module to release.
    },
  };
  standIns.add(solver);
  return solver;
}

export interface LoadedSolver {
  solver: ConstraintSolver;
  /** True while the stand-in is in use; the UI shows a notice. */
  placeholder: boolean;
  /** Why the real solver failed, for the notice and debugging. */
  reason?: string;
}

/** The real solver if `createSolver()` succeeds, else the stand-in. */
export async function loadSolver(): Promise<LoadedSolver> {
  try {
    return { solver: await createSolver(), placeholder: false };
  } catch (error) {
    // Reported, not swallowed, so a fallback is visible.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`constraint solver could not start: ${reason}`);
    return { solver: placeholderSolver(), placeholder: true, reason };
  }
}
