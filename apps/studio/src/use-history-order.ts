/**
 * Reordering history steps and rolling back (audit F-052, F-053), for the Items panel. A move that
 * would put a step above its dependencies is refused before building, naming the steps
 * (`moveProblem`); any other move is an ordinary journal step.
 */
import { type FeatureId, moveProblem } from '@bezier/core';
import { type RefObject, useCallback, useMemo } from 'react';
import type { Session, SessionView } from './session.js';

type Run = (change: (session: Session) => Promise<SessionView>) => void;

export function useHistoryOrder(
  run: Run,
  sessionRef: RefObject<Session | null>,
  view: SessionView | null,
  say: (message: string) => void,
) {
  const onMove = useCallback(
    (id: FeatureId, toIndex: number) => {
      const session = sessionRef.current;
      if (session === null) return;
      const problem = moveProblem(session.document, id, toIndex);
      if (problem !== null) {
        say(problem);
        return;
      }
      void run((current) => current.apply({ op: 'moveFeature', id, toIndex }));
    },
    [run, sessionRef, say],
  );
  const onRollback = useCallback(
    (at: number | null) => void run((current) => current.rollBackTo(at)),
    [run],
  );
  const rollback = view?.rollback ?? null;
  return useMemo(() => ({ rollback, onMove, onRollback }), [rollback, onMove, onRollback]);
}
