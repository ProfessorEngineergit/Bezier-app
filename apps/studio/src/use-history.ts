/**
 * Undo and redo. Separate from `run` because these can be declined (empty stack), which must be
 * reported rather than shown as a no-op rebuild. The mechanics are in `Session.undo`/`redo`; this
 * decides when a keystroke is refused and which stale UI to drop afterwards.
 */

import type { MutableRefObject, RefObject } from 'react';
import { useCallback } from 'react';
import { MODEL_BUSY_MESSAGE, type ModelLock } from './model-lock.js';
import type { Session, SessionView } from './session.js';
import type { SketchState } from './use-sketch.js';

export type HistoryDirection = 'undo' | 'redo';

interface HistoryDeps {
  sessionRef: MutableRefObject<Session | null>;
  sketchRef: RefObject<SketchState>;
  setView: (view: SessionView) => void;
  setBusy: (busy: boolean) => void;
  /** Undo is a change like any other and waits for the one already building. */
  lock: ModelLock;
  say: (message: string) => void;
  /** Drops selections, gizmos and modes that may refer to geometry that is gone. */
  clearSelection: () => void;
}

export function useHistory({
  sessionRef,
  sketchRef,
  setView,
  setBusy,
  lock,
  say,
  clearSelection,
}: HistoryDeps): (direction: HistoryDirection) => void {
  return useCallback(
    (direction: HistoryDirection) => {
      const session = sessionRef.current;
      if (session === null) return;

      // Refused during a sketch: the draft is not journalled, so undo would skip past it and remove
      // the previous feature.
      if (sketchRef.current.draft.primitives.length > 0) {
        say('Finish or clear the sketch before undoing.');
        return;
      }

      const release = lock.tryHold();
      if (release === null) {
        say(MODEL_BUSY_MESSAGE);
        return;
      }
      setBusy(true);
      void (direction === 'undo' ? session.undo() : session.redo())
        .then((next) => {
          if (next === null) {
            say(direction === 'undo' ? 'Nothing left to undo.' : 'Nothing to redo.');
            return;
          }
          setView(next);
          // Undo or redo can remove geometry a selection or gizmo is attached to.
          clearSelection();
        })
        .catch((error: unknown) => say(error instanceof Error ? error.message : String(error)))
        .finally(() => {
          setBusy(false);
          release();
        });
    },
    [sessionRef, sketchRef, setView, setBusy, lock, say, clearSelection],
  );
}
