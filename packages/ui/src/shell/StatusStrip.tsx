/**
 * Running tasks, next to Export. Not rendered at all when nothing runs. Several tasks stack (e.g.
 * an export during an import); the list is capped and the overflow counted.
 */

import type { RunningTask } from './task-progress.js';
import { describeTask } from './task-progress.js';

/** Maximum rows; more would grow the bar into the canvas. The rest are counted. */
const SHOWN = 2;

export interface StatusStripProps {
  tasks: readonly RunningTask[];
}

export function StatusStrip({ tasks }: StatusStripProps) {
  if (tasks.length === 0) return null;

  const shown = tasks.slice(0, SHOWN);
  const hidden = tasks.length - shown.length;

  return (
    // `polite`: progress should never interrupt what the user is reading.
    <div aria-live="polite" className="status">
      {shown.map((task) => (
        <TaskProgress key={task.id} task={task} />
      ))}
      {hidden > 0 && <span className="status__rate">+{hidden}</span>}
    </div>
  );
}

/** One task's bar with label and caption, or with `bare` the bar alone. */
export function TaskProgress({ task, bare = false }: { task: RunningTask; bare?: boolean }) {
  const caption = describeTask(task);
  const known = task.progress !== undefined && Number.isFinite(task.progress);
  const percent = known ? Math.min(100, Math.max(0, (task.progress ?? 0) * 100)) : 0;
  const track = (
    <span className="status__track">
      {/* Unknown progress shows an indeterminate animation, not a number. */}
      <span
        className="status__fill"
        data-complete={known && percent >= 100 ? '' : undefined}
        data-indeterminate={known ? undefined : ''}
        style={known ? { width: `${percent}%` } : undefined}
      />
    </span>
  );
  if (bare) return track;

  return (
    <div className="status__task">
      <span className="status__label">{task.label}</span>
      {track}
      {caption !== '' && <span className="status__rate">{caption}</span>}
    </div>
  );
}
