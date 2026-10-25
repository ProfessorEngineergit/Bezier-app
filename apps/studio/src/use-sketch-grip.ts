/**
 * Dragging drawn geometry with no tool active: a press grabs a point, line or curve and the solver
 * keeps all constraints (`sketch-drag.ts`). Each frame solves from the drawing at press time, so
 * passing through infeasible positions recovers cleanly. The whole drag is one undo step.
 */

import type { ConstraintSolver, Sketch, SketchId } from '@bezier/solver';
import { dragSketch, gripAt, type Point2D, type SketchGrip } from '@bezier/ui';
import { type MutableRefObject, useMemo, useRef } from 'react';

export interface SketchGrabber {
  /** Grabs whatever is under `at`. False when nothing is, so the press is not a drag. */
  start: (at: Point2D, hitRadius: number) => boolean;
  move: (at: Point2D) => void;
  end: () => void;
}

interface Deps {
  draftRef: MutableRefObject<Sketch>;
  history: MutableRefObject<Sketch[]>;
  commitDraft: (next: Sketch, record?: boolean) => void;
  solver: () => ConstraintSolver | null;
  isStandIn: (solver: ConstraintSolver) => boolean;
  select: (ids: readonly SketchId[]) => void;
}

export function useSketchGrip({
  draftRef,
  history,
  commitDraft,
  solver,
  isStandIn,
  select,
}: Deps): SketchGrabber {
  const held = useRef<{ grip: SketchGrip; from: Point2D; before: Sketch; moved: boolean } | null>(
    null,
  );
  // Read through refs at call time, so the object passed to the viewport is stable.
  const deps = useRef({ commitDraft, solver, isStandIn, select });
  deps.current = { commitDraft, solver, isStandIn, select };
  return useMemo<SketchGrabber>(
    () => ({
      start(at, hitRadius) {
        const grip = gripAt(draftRef.current, at, hitRadius);
        held.current =
          grip === null ? null : { grip, from: at, before: draftRef.current, moved: false };
        return grip !== null;
      },
      move(at) {
        const now = held.current;
        if (now === null) return;
        const active = deps.current.solver();
        const next = dragSketch(
          now.before,
          now.grip,
          { u: at.u - now.from.u, v: at.v - now.from.v },
          active === null || deps.current.isStandIn(active) ? null : active,
        );
        if (next === null) return;
        deps.current.commitDraft(next, false);
        now.moved = true;
      },
      end() {
        const now = held.current;
        held.current = null;
        if (now === null || !now.moved) return;
        history.current.push(now.before);
        if (history.current.length > 200) history.current.shift();
        deps.current.select([now.grip.target]);
      },
    }),
    [draftRef, history],
  );
}
