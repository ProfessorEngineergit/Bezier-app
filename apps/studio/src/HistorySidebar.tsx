/**
 * The history down the right side of the model, the counterpart of the Items panel on the left. The
 * steps run from the top down and the playhead stands where they stop being built: drag it, or use
 * the controls at the head of the panel, and the model follows. That is the session's rollback, so
 * nothing is written to the document. While it moves, the list keeps it in view.
 */

/// <reference lib="dom" />

import type { FeatureRecord } from '@bezier/core';
import {
  PauseIcon,
  PlayIcon,
  StepBackIcon,
  StepForwardIcon,
  TimelapseIcon,
  ToEndIcon,
  ToStartIcon,
} from '@bezier/ui';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { HistorySteps, type HistoryStepsProps } from './HistorySteps.js';
import { gapAt, headOf, rollbackAt } from './history-playback.js';
import { ResizeHandle } from './ResizeHandle.js';
import './history-sidebar.css';
import type { TimelapseCue } from './timelapse-script.js';
import { reducedMotion } from './use-flip.js';
import { useHistoryPlayback } from './use-history-playback.js';
import { useTimelapse } from './use-timelapse.js';
import type { ViewportHandle } from './Viewport.js';

export const HISTORY_WIDTH_DEFAULT = 262;
export const HISTORY_WIDTH_MIN = 208;
export const HISTORY_WIDTH_MAX = 420;

type Steps = Omit<HistoryStepsProps, 'shown' | 'head' | 'rollback' | 'onRollback'>;

export interface HistorySidebarProps extends Steps {
  features: readonly FeatureRecord[];
  rollback: number | null;
  onRollback: (at: number | null) => void;
  /** A sketch is open: its edit is not on the history yet, so the model must not move under it. */
  locked: boolean;
  /** What the rail and the viewport should show of a timelapse. */
  onCue: (cue: TimelapseCue | null) => void;
  viewport: RefObject<ViewportHandle | null>;
  width: number;
  onWidthChange: (width: number) => void;
}

export function HistorySidebar({
  rollback,
  onRollback,
  locked,
  onCue,
  viewport,
  width,
  onWidthChange,
  ...steps
}: HistorySidebarProps) {
  const count = steps.features.length;
  const built = headOf(rollback, count);
  const steady = useHistoryPlayback(built, count, onRollback);
  const timelapse = useTimelapse(steps.features, built, onRollback, onCue, viewport);
  const [fast, setFast] = useState(false);
  const playing = steady.playing || timelapse.running;
  const stop = () => {
    steady.stop();
    timelapse.stop();
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const [dragged, setDragged] = useState<number | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const head = dragged ?? built;
  const go = (at: number) => {
    stop();
    onRollback(rollbackAt(at, count));
  };

  // A sketch opened while playing stops the play.
  useEffect(() => {
    if (locked) stopRef.current();
  }, [locked]);

  // The playhead lies over the list, so rows never shift under the pointer: it is placed on the gap
  // it stands in, after every render, since a row's height changes with its note.
  useLayoutEffect(() => {
    const line = headRef.current;
    const rows = body.current?.querySelectorAll('.items-entry');
    if (line === null || rows === undefined || rows.length === 0) return;
    const top = line.parentElement?.getBoundingClientRect().top ?? 0;
    const before = rows[head - 1]?.getBoundingClientRect().bottom;
    const after = rows[head]?.getBoundingClientRect().top;
    const gap = before !== undefined && after !== undefined ? (before + after) / 2 : before;
    line.style.transform = `translateY(${(gap ?? after ?? top) - top}px)`;
    // It glides between steps, but opens where it stands.
    if (line.dataset.placed === undefined) {
      requestAnimationFrame(() => {
        line.dataset.placed = '';
      });
    }
  });

  // Keeps it in view as it moves, wherever it was moved from.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs because the playhead moved
  useEffect(() => {
    if (dragged !== null) return;
    headRef.current?.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [head, dragged]);

  const gapUnder = (event: PointerEvent) => {
    const rows = body.current?.querySelectorAll('.items-entry') ?? [];
    return gapAt(
      event.clientY,
      [...rows].map((row) => row.getBoundingClientRect()),
    );
  };

  const control = (label: string, icon: ReactNode, run: () => void, enabled: boolean) => (
    <button
      aria-label={label}
      className="history-panel__control"
      disabled={!enabled}
      onClick={run}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );

  const onHeadKey = (event: KeyboardEvent) => {
    const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (by === 0 || locked) return;
    event.preventDefault();
    go(built + by);
  };

  return (
    <aside aria-label="History" className="history-panel" style={{ width: `${width}px` }}>
      <header className="items-panel__head history-panel__head">
        <h2>History</h2>
        {count > 0 && (
          <span className="history-panel__tail">
            <button
              aria-label="Timelapse"
              aria-pressed={fast}
              className="history-panel__timelapse"
              onClick={() => {
                stop();
                setFast(!fast);
              }}
              title="Timelapse: play it as if it were being made, tools and camera included"
              type="button"
            >
              <TimelapseIcon />
            </button>
            <span className="history-panel__count">
              {head} / {count}
            </span>
          </span>
        )}
      </header>

      {count > 0 && (
        <div aria-label="Playback" className="history-panel__transport" role="toolbar">
          {control('To the start', <ToStartIcon />, () => go(0), !locked && built > 0)}
          {control('Step back', <StepBackIcon />, () => go(built - 1), !locked && built > 0)}
          {playing
            ? control('Pause', <PauseIcon />, stop, true)
            : control(
                fast ? 'Play timelapse' : 'Play',
                <PlayIcon />,
                fast ? () => void timelapse.start() : steady.play,
                !locked,
              )}
          {control(
            'Step forward',
            <StepForwardIcon />,
            () => go(built + 1),
            !locked && built < count,
          )}
          {control('To the end', <ToEndIcon />, () => go(count), !locked && built < count)}
        </div>
      )}

      <div className="items-panel__body history-panel__body" ref={body}>
        {count === 0 ? (
          <div className="items-panel__empty">
            <p className="items-panel__emptyTitle">Nothing yet</p>
            <p className="items-panel__emptyNote">Every step you make shows up here, in order</p>
          </div>
        ) : (
          <div className="history-panel__list">
            <HistorySteps
              {...steps}
              head={head}
              // A step clicked is where the model stands: built up to it, with its settings open.
              onSelect={(id) => {
                const index = steps.features.findIndex((feature) => feature.id === id);
                if (!locked && index >= 0) go(index + 1);
                steps.onSelect(id);
              }}
              onHover={(id) => viewport.current?.hoverStep(id)}
              onRollback={onRollback}
              rollback={rollback}
            />
            <div
              aria-label="Playhead"
              aria-valuemax={count}
              aria-valuemin={0}
              aria-valuenow={head}
              aria-valuetext={`${head} of ${count} steps built`}
              className="history-head"
              data-dragging={dragged === null ? undefined : ''}
              onKeyDown={onHeadKey}
              onPointerCancel={() => setDragged(null)}
              onPointerDown={(event) => {
                if (locked) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                stop();
                setDragged(built);
              }}
              onPointerMove={(event) => {
                if (dragged !== null) setDragged(gapUnder(event));
              }}
              onPointerUp={() => {
                if (dragged !== null && dragged !== built) go(dragged);
                setDragged(null);
              }}
              ref={headRef}
              role="slider"
              tabIndex={0}
            />
          </div>
        )}
      </div>

      <ResizeHandle
        className="history-panel__resize"
        direction="left"
        label="Resize history panel"
        max={HISTORY_WIDTH_MAX}
        min={HISTORY_WIDTH_MIN}
        onResize={onWidthChange}
        reset={HISTORY_WIDTH_DEFAULT}
        width={width}
      />
    </aside>
  );
}
