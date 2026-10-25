/**
 * The single path from a user action to a document change. `run` takes the model lock (waiting if a
 * change is building, `model-lock.ts`), marks the app busy, shows slow changes in the task bar and
 * displays the result.
 */

import { type MutableRefObject, useCallback } from 'react';
import { tellIsland } from './island/island-feed.js';
import type { ModelLock } from './model-lock.js';
import type { Session, SessionView } from './session.js';
import { traced } from './trace.js';
import type { TaskHandle, TasksHandle } from './use-tasks.js';

/** How long a change may take before it shows as a task. */
const SLOW_CHANGE_MS = 250;

export type Run = (change: (session: Session) => Promise<SessionView>) => Promise<void>;

export function useRun({
  sessionRef,
  tasksRef,
  lock,
  setBusy,
  setView,
  say,
}: {
  sessionRef: MutableRefObject<Session | null>;
  /** Where slow changes show progress; set once the project hook exists. */
  tasksRef: MutableRefObject<TasksHandle | null>;
  lock: ModelLock;
  setBusy: (busy: boolean) => void;
  setView: (view: SessionView) => void;
  say: (message: string) => void;
}): Run {
  return useCallback(
    async (change) => {
      const session = sessionRef.current;
      if (session === null) return;
      // Waits rather than refuses. New commands are refused at their source (rail, shortcuts, model
      // handles), so what arrives here during a build is already decided input (a typed value, a
      // drag commit) that must not be lost.
      const release = await lock.acquire();
      setBusy(true);
      // Most changes finish within a frame or two and show nothing; slow ones get a progress bar.
      let slow: TaskHandle | undefined;
      const wait = setTimeout(() => {
        slow = tasksRef.current?.begin('Updating the model', { light: true });
      }, SLOW_CHANGE_MS);
      try {
        const view = await traced('change', () => change(session));
        if (lock.takeCancel()) {
          // Cancelled: the engine was terminated mid-change and its shapes are gone. Revert the
          // change and rebuild from the journal on a fresh engine.
          session.engineReplaced();
          const back = await session.undo();
          setView(back ?? (await session.rebuild()));
          say('Stopped. The last change was taken back.');
        } else if (sessionRef.current === session) setView(view);
        // Otherwise the project was left while this ran (a background model load): it is written to
        // its own project and the screen is not updated. If the user went to the start page, it is
        // still the last session. Either way Nib says it is in, so it can be opened from anywhere.
        if (
          session.expecting &&
          (sessionRef.current !== session || document.querySelector('.library') !== null)
        )
          tellIsland({ kind: 'arrived', project: session.id, name: session.document.meta.name });
      } catch (error) {
        say(error instanceof Error ? error.message : String(error));
      } finally {
        clearTimeout(wait);
        // Whatever was being loaded into the project has arrived or failed.
        session.expecting = false;
        slow?.done();
        setBusy(false);
        release();
      }
    },
    [sessionRef, tasksRef, lock, setBusy, setView, say],
  );
}
