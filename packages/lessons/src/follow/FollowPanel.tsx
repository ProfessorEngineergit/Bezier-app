/**
 * The follow-along panel: the lesson as a picture-in-picture over the editor. The editor shows
 * each checkpoint as the video reaches it, until the learner edits the model.
 *
 * Recording and author camera are two tiles, side by side or stacked when small. One button
 * switches between a small and a large panel. Dragging and edge snapping live in `usePip.ts`.
 */

import './follow.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLessons, useLessonsState } from '../app/context.js';
import { Controls } from '../player/Controls.js';
import { Stage } from '../player/Stage.js';
import { usePlayback } from '../player/usePlayback.js';
import { useShortcuts } from '../player/useShortcuts.js';
import { Icon } from '../ui/Icon.js';
import { Speaker } from './Speaker.js';
import { usePip } from './usePip.js';

export function FollowPanel() {
  const lessons = useLessons();
  const { following } = useLessonsState();
  const [collapsed, setCollapsed] = useState(false);
  const [modelFollows, setModelFollows] = useState(following?.preserveModel !== true);
  /** The tile shown larger when the panel is large. */
  const [focus, setFocus] = useState<'video' | 'speaker'>('video');
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pip = usePip(panel, content);
  const shown = useRef(-1);
  const request = useRef(0);
  const lesson = following?.lesson;
  const manifest = lesson?.manifest;
  const at = following?.at ?? 0;

  // The panel is only mounted with a manifest; `EMPTY` keeps the hook order stable.
  const playback = usePlayback(manifest ?? EMPTY, { startAt: at, skipRemoved: true });
  const current = playback.current;
  useEffect(() => lessons.host.onEdit(() => setModelFollows(false)), [lessons]);

  // Show each checkpoint once as the video reaches it; when scrubbing across several, only the
  // latest request applies.
  useEffect(() => {
    if (!modelFollows || current === undefined || current.index === shown.current) return;
    shown.current = current.index;
    request.current += 1;
    const mine = request.current;
    void lessons.host
      // The lesson title names the learner's project if they edit it.
      .showState(current.project, lesson?.manifest.title ?? current.title, {
        lesson: lesson?.manifest.id ?? '',
        at: playback.time,
      })
      .catch((problem: unknown) => {
        if (mine === request.current) {
          lessons.complain(problem, 'The editor could not show this checkpoint.', 'editor');
        }
      });
  }, [current, modelFollows, lessons, lesson, playback.time]);

  useShortcuts(
    !collapsed,
    useCallback(
      (key) => {
        if (key === ' ' || key.toLowerCase() === 'k') playback.toggle();
        else if (key.toLowerCase() === 'v') pip.toggleSize();
        else if (key === 'ArrowLeft') playback.seekBy(-5);
        else if (key === 'ArrowRight') playback.seekBy(5);
        else if (key === 'ArrowUp') playback.chapter(-1);
        else if (key === 'ArrowDown') playback.chapter(1);
        else return false;
        return true;
      },
      [playback, pip],
    ),
  );

  if (lesson === undefined || manifest === undefined) return null;
  const hasCamera = lesson.camera !== undefined;
  // Swapping only applies when both tiles fit side by side.
  const swapped = focus === 'speaker' && pip.size === 'large' && hasCamera;

  return (
    <aside
      aria-label="Following along"
      className="lessons-follow lessons-glass"
      data-carrying={pip.carrying ? '' : undefined}
      data-collapsed={collapsed ? '' : undefined}
      data-overlaps-cube={pip.cubeOverlap ? '' : undefined}
      data-settling={pip.settling ? '' : undefined}
      data-size={pip.size}
      data-stuck={
        Object.entries(pip.stuck)
          .filter(([, on]) => on)
          .map(([side]) => side)
          .join(' ') || undefined
      }
      ref={panel}
      style={{ transform: pip.place, width: pip.width }}
    >
      <div className="lessons-follow__content" ref={content}>
        {/* The header drags the panel; the grip button by the title moves it with arrow keys. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: see the grip button in it */}
        <header
          className="lessons-follow__head"
          onDoubleClick={(event) => {
            if ((event.target as Element).closest('button') === null) pip.toggleSize();
          }}
          onPointerDown={pip.carry}
        >
          <button
            aria-label="Move the lesson (arrow keys)"
            className="lessons-follow__grip"
            onKeyDown={(event) => {
              const step = event.shiftKey ? 1 : 12;
              const move: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              };
              const by = move[event.key];
              if (by === undefined) return;
              event.preventDefault();
              pip.nudge(by[0], by[1]);
            }}
            type="button"
          >
            <Icon name="grip" size={16} />
          </button>
          <span className="lessons-follow__text">
            <span className="lessons-follow__eyebrow lessons-label">Following along</span>
            <span className="lessons-follow__title">{manifest.title}</span>
          </span>
          <button
            aria-label={pip.size === 'small' ? 'Make the video larger' : 'Make the editor larger'}
            aria-pressed={pip.size === 'large'}
            className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
            onClick={pip.toggleSize}
            title={
              pip.size === 'small'
                ? 'Give the video the room (V)'
                : 'Give the room back to the editor (V)'
            }
            type="button"
          >
            <Icon name={pip.size === 'small' ? 'expand' : 'shrink'} />
          </button>
          <button
            aria-label={collapsed ? 'Show the lesson' : 'Fold the lesson away'}
            className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
            onClick={() => setCollapsed((value) => !value)}
            type="button"
          >
            <Icon name={collapsed ? 'chevron-up' : 'chevron-down'} />
          </button>
          <button
            className="lessons-button lessons-button--small"
            onClick={lessons.leaveFollow}
            type="button"
          >
            Leave
          </button>
        </header>
        {collapsed && (
          <div className="lessons-follow__folded">
            <button
              aria-label={playback.playing ? 'Pause' : 'Play'}
              className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
              onClick={playback.toggle}
              type="button"
            >
              <Icon name={playback.playing ? 'pause' : 'play'} />
            </button>
            <span className="lessons-follow__step">
              {current === undefined
                ? ''
                : `Chapter ${current.index + 1} of ${playback.chapters.length} · ${current.title}`}
            </span>
          </div>
        )}
        <div className="lessons-follow__body" hidden={collapsed}>
          <div
            className="lessons-follow__tiles"
            data-focus={swapped ? 'speaker' : undefined}
            data-speaker={hasCamera ? '' : undefined}
          >
            <div className="lessons-follow__tile" data-role="video">
              <Stage
                box={box}
                compact={pip.size === 'small' || swapped}
                lesson={lesson}
                playback={playback}
                separateCamera
              />
              {swapped && (
                <Veil label="Show the recording large" onSwap={() => setFocus('video')} />
              )}
            </div>
            {hasCamera && (
              <div className="lessons-follow__tile" data-role="speaker">
                <Speaker lesson={lesson} playback={playback} />
                {pip.size === 'large' && !swapped && (
                  <Veil label="Show the author large" onSwap={() => setFocus('speaker')} />
                )}
              </div>
            )}
          </div>
          <Controls
            compact
            fullscreen={false}
            onFullscreen={() => void box.current?.requestFullscreen?.()}
            onHelp={() => undefined}
            playback={playback}
          />
          <label className="lessons-check lessons-follow__toggle">
            <input
              checked={modelFollows}
              onChange={(event) => {
                setModelFollows(event.target.checked);
                if (event.target.checked) shown.current = -1;
              }}
              type="checkbox"
            />
            The model follows the video
          </label>
        </div>
      </div>
      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
        <button
          key={corner}
          className="lessons-follow__resize"
          data-corner={corner}
          aria-label={`Resize lesson from ${corner.replace('-', ' ')}`}
          onPointerDown={(event) => pip.resize(event, corner)}
          type="button"
        />
      ))}
    </aside>
  );
}

/** Covers the smaller tile; pressing it swaps the tiles. */
function Veil({ label, onSwap }: { label: string; onSwap: () => void }) {
  return (
    <button aria-label={label} className="lessons-follow__veil" onClick={onSwap} type="button">
      <span className="lessons-follow__swap">
        <Icon name="swap" size={20} />
      </span>
    </button>
  );
}

const EMPTY = {
  format: 'bezier-lesson' as const,
  version: 1 as const,
  id: '',
  title: '',
  description: '',
  createdAt: '',
  duration: 0,
  viewportType: '',
  events: [],
  states: [],
  cuts: [],
  avatar: [],
  completed: false,
};
