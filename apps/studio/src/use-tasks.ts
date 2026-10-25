/**
 * Registry of work in flight and the notices it leaves. The title bar strip and the toasts are two
 * views of the same tasks, so they live in one place. `begin` returns a handle, the only way to
 * update or finish that task.
 */

import { describeTask, type Notice, type RunningTask, type Tone } from '@bezier/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { tellIsland } from './island/island-feed.js';

export interface TaskHandle {
  /** Updates the bar with a fraction from 0 to 1; omit it to stay indeterminate. */
  progress: (
    fraction: number,
    detail?: { bytesPerSecond?: number; bytesRemaining?: number; phase?: string },
  ) => void;
  /** Removes the task from the strip and, if given, shows a notice instead. */
  done: (notice?: { title: string; detail?: string; tone?: Tone }) => void;
}

export interface TasksHandle {
  tasks: readonly RunningTask[];
  notices: readonly Notice[];
  /** `light`: a change taking slightly too long; Nib only shows strain, with no bar. */
  begin: (label: string, options?: { light?: boolean }) => TaskHandle;
  /** A one-off notice with no task: a copy, a paste, a refusal. */
  notify: (notice: { title: string; detail?: string; tone?: Tone }) => void;
  dismiss: (id: string) => void;
}

export function useTasks(): TasksHandle {
  const [tasks, setTasks] = useState<readonly RunningTask[]>([]);
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  // Ids only need to be unique per session; a counter, unlike Date.now(), cannot collide.
  const next = useRef(0);
  const light = useRef(new Set<string>());

  // Nib in the title bar shows work in progress. Cleared when the project closes, so a project
  // closed mid-export does not leave him busy.
  useEffect(() => {
    tellIsland({
      kind: 'tasks',
      tasks: tasks.map((task) => ({
        label: task.label,
        ...(task.progress !== undefined ? { progress: task.progress } : {}),
        detail: describeTask(task),
        ...(light.current.has(task.id) ? { light: true } : {}),
      })),
    });
  }, [tasks]);
  useEffect(() => () => tellIsland({ kind: 'tasks', tasks: [] }), []);

  const dismiss = useCallback((id: string) => {
    setNotices((all) => all.filter((notice) => notice.id !== id));
  }, []);

  const notify = useCallback((notice: { title: string; detail?: string; tone?: Tone }) => {
    next.current += 1;
    const id = `notice-${next.current}`;
    // Notice lifetime is handled by `Toasts.tsx`, which pauses while hovered.
    setNotices((all) => [...all, { id, ...notice }]);
    tellIsland({ kind: 'notice', tone: notice.tone ?? 'info', title: notice.title });
  }, []);

  const begin = useCallback(
    (label: string, options?: { light?: boolean }): TaskHandle => {
      next.current += 1;
      const id = `task-${next.current}`;
      if (options?.light === true) light.current.add(id);
      setTasks((all) => [...all, { id, label }]);

      return {
        progress: (fraction, detail) => {
          setTasks((all) =>
            // Details replace the previous ones rather than merge, so a read rate does not linger
            // into a phase that moves no bytes.
            all.map((task) =>
              task.id === id ? { id, label: task.label, progress: fraction, ...detail } : task,
            ),
          );
        },
        done: (notice) => {
          light.current.delete(id);
          setTasks((all) => all.filter((task) => task.id !== id));
          if (notice !== undefined) notify(notice);
        },
      };
    },
    [notify],
  );

  return { tasks, notices, begin, notify, dismiss };
}
