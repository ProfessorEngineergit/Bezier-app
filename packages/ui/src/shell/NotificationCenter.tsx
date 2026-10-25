/**
 * Running work in the title bar corner (notices are toasts, see `Toasts.tsx`). A compact mark shows
 * the current task's phase and progress; clicking it lists all tasks with file, rate and time left.
 * Not rendered when nothing runs.
 */

/// <reference lib="dom" />

import { useEffect, useRef, useState } from 'react';
import type { Notice, Tone } from './notification-types.js';
import { TaskProgress } from './StatusStrip.js';
import { describeTask, formatPercent, type RunningTask } from './task-progress.js';

export interface NotificationCenterProps {
  tasks: readonly RunningTask[];
}

/** The most severe tone present. */
export function summaryTone(notices: readonly Notice[]): Tone {
  if (notices.some((notice) => (notice.tone ?? 'info') === 'fail')) return 'fail';
  if (notices.some((notice) => (notice.tone ?? 'info') === 'ok')) return 'ok';
  return 'info';
}

export function NotificationCenter({ tasks }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const running = tasks[0];

  useEffect(() => {
    if (tasks.length === 0) setOpen(false);
  }, [tasks.length]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node) !== true) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (running === undefined) return <div className="notification-center" />;

  const known = running.progress !== undefined && Number.isFinite(running.progress);
  return (
    <div className="notification-center" ref={root}>
      <button
        aria-expanded={open}
        aria-label={`${running.label}${known ? `, ${formatPercent(running.progress ?? 0)}` : ''}`}
        aria-live="polite"
        className="work-chip"
        onClick={() => {
          // Under the loading screen the panel would open behind it, unreachable.
          if (document.documentElement.hasAttribute('data-loading-below-bar')) return;
          setOpen((was) => !was);
        }}
        title={running.label}
        type="button"
      >
        <span className="work-chip__phase">{running.phase ?? running.label}</span>
        <TaskProgress bare task={running} />
        {known && (
          <span className="work-chip__percent">{formatPercent(running.progress ?? 0)}</span>
        )}
        {tasks.length > 1 && <span className="work-chip__more">+{tasks.length - 1}</span>}
      </button>

      {open && (
        <section aria-label="Running work" className="work-panel">
          <ol>
            {tasks.map((task) => (
              <li key={task.id}>
                <p className="work-panel__label">{task.label}</p>
                <TaskProgress bare task={task} />
                <p className="work-panel__detail">{describeTask(task)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
