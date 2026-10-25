/**
 * Sketch diagnostics: remaining degrees of freedom, fully defined elements, and constraints to mark
 * (contradicted by a refused change, or redundant). Separate from `use-sketch.ts`; this only
 * queries the solver.
 */

import type { ConstraintSolver, Sketch, SketchId } from '@bezier/solver';
import { namedBy } from '@bezier/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

const NONE: ReadonlySet<SketchId> = new Set();

/** Constraints in `before` that reference something the new constraints of `after` reference. */
export function touchedBy(before: Sketch, after: Sketch): SketchId[] {
  const had = new Set(before.constraints.map((c) => c.id));
  const named = new Set(after.constraints.filter((c) => !had.has(c.id)).flatMap((c) => namedBy(c)));
  return before.constraints.filter((c) => namedBy(c).some((id) => named.has(id))).map((c) => c.id);
}

export function useSketchDiagnosis(
  draft: Sketch,
  solver: () => ConstraintSolver | null,
  isStandIn: (solver: ConstraintSolver) => boolean,
) {
  /**
   * Remaining degrees of freedom; zero is fully defined. Solved on every draft change (well under a
   * millisecond). Null when empty, or with the stand-in solver.
   */
  /** Constraints a refused change contradicted, marked until a change is accepted. */
  const [conflicts, setConflicts] = useState<ReadonlySet<SketchId>>(() => new Set());
  const askSolver = useRef(solver);
  askSolver.current = solver;
  const diagnosis = useMemo(() => {
    const active = askSolver.current();
    if (active === null || isStandIn(active) || draft.primitives.length === 0) return null;
    try {
      const result = active.solve(draft);
      return result.status === 'failed' || result.status === 'conflicting'
        ? null
        : { dof: result.dof, redundant: new Set(result.redundant) };
    } catch {
      return null;
    }
  }, [draft, isStandIn]);
  const freedom = diagnosis?.dof ?? null;
  const flags = useMemo(() => {
    const marked = new Map<SketchId, 'conflict' | 'redundant'>();
    for (const id of diagnosis?.redundant ?? NONE) marked.set(id, 'redundant');
    for (const id of conflicts) marked.set(id, 'conflict');
    return marked;
  }, [diagnosis, conflicts]);
  /**
   * Elements fully determined by constraints. One solve per element, so computed once the drawing
   * settles rather than on every drag frame.
   */
  const [defined, setDefined] = useState<ReadonlySet<SketchId>>(() => new Set());
  useEffect(() => {
    const active = askSolver.current();
    // One solve per element: past a few hundred (a line of text) that takes seconds.
    if (
      active === null ||
      isStandIn(active) ||
      active.determined === undefined ||
      draft.primitives.length > 400
    ) {
      setDefined(new Set());
      return;
    }
    const wait = window.setTimeout(() => {
      try {
        setDefined(active.determined?.(draft) ?? new Set());
      } catch {
        setDefined(new Set());
      }
    }, 160);
    return () => window.clearTimeout(wait);
  }, [draft, isStandIn]);

  return { freedom, defined, flags, setConflicts };
}
