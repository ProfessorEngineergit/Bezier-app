/**
 * The author's edit view: stage, timeline, inspector and lesson details. The playhead can enter
 * removed stretches here so the author can review what is left out.
 */

import './edit.css';
import './timeline.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLessons } from '../app/context.js';
import { useLesson } from '../app/useLesson.js';
import { clips as clipsOf, deleteClip, splitClip, trimClip } from '../format/clips.js';
import { clock, clockFine } from '../format/clock.js';
import { addChapterAt, moveChapter, removeChapter, removeStretch } from '../format/edits.js';
import type { LessonManifest, StoredLesson } from '../format/manifest.js';
import { addZoom, removeZoom } from '../format/zoom.js';
import { Stage } from '../player/Stage.js';
import { usePlayback } from '../player/usePlayback.js';
import { useShortcuts } from '../player/useShortcuts.js';
import { Icon } from '../ui/Icon.js';
import { isMac } from '../ui/platform.js';
import { EditCamera } from './EditCamera.js';
import { EditChapters } from './EditChapters.js';
import { EditDetails } from './EditDetails.js';
import { Inspector } from './Inspector.js';
import { type Selection, sameSelection, type TrimPoints } from './selection.js';
import { Timeline } from './Timeline.js';
import { useManifestEdits } from './useManifestEdits.js';

export function EditView({ id }: { id: string }) {
  const { lesson, error } = useLesson(id);
  if (error !== null) return <p className="lessons-edit lessons-dim">{error}</p>;
  if (lesson === null) return <p className="lessons-edit lessons-dim">Opening the lesson…</p>;
  return <Editing lesson={lesson} />;
}

const SAVED_WORDS = { saved: 'Saved', saving: 'Saving…', failed: 'Not saved' };

function Editing({ lesson }: { lesson: StoredLesson }) {
  const lessons = useLessons();
  const { manifest, change, saved, flush, undo, redo, canUndo, canRedo } = useManifestEdits(
    lesson.manifest,
  );
  const box = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<TrimPoints>({ in: null, out: null });
  const [selection, setSelectionState] = useState<Selection>(null);
  // Playback skips cuts as it will for the learner; the playhead can still be placed inside one.
  const [skipCuts, setSkipCuts] = useState(true);
  const playback = usePlayback(manifest, { skipRemoved: skipCuts, seekAnywhere: true });
  const { time } = playback;
  const edited: StoredLesson = { ...lesson, manifest };
  const clips = useMemo(() => clipsOf(manifest), [manifest]);

  const select = useCallback(
    (next: Selection) => setSelectionState((was) => (sameSelection(was, next) ? was : next)),
    [],
  );

  const leave = (screen: 'player' | 'list') => {
    void flush();
    lessons.show(screen === 'player' ? { kind: 'player', id: manifest.id } : { kind: 'list' });
  };

  const removeBetween = useCallback(() => {
    if (points.in === null || points.out === null || points.out - points.in <= 0.05) return;
    const { in: from, out: to } = points;
    change((m) => removeStretch(m, from, to));
    setPoints({ in: null, out: null });
  }, [points, change]);

  const deleteSelected = useCallback(() => {
    if (selection === null) return;
    if (selection.kind === 'clip') change((m) => deleteClip(m, selection.index));
    else if (selection.kind === 'chapter') change((m) => removeChapter(m, selection.index));
    else if (selection.kind === 'zoom') change((m) => removeZoom(m, selection.index));
    else return;
    select(null);
  }, [selection, change, select]);

  useShortcuts(
    true,
    useCallback(
      (key, event) => {
        const lower = key.toLowerCase();
        const step = event.shiftKey ? 0.1 : 1;
        if (key === ' ' || lower === 'k') playback.toggle();
        else if (key === 'ArrowLeft') playback.seek(time - step);
        else if (key === 'ArrowRight') playback.seek(time + step);
        else if (key === 'Home') playback.seek(0);
        else if (key === 'End') playback.seek(manifest.duration);
        else if (lower === 'i')
          setPoints((p) => ({ in: time, out: p.out !== null && p.out > time ? p.out : null }));
        else if (lower === 'o')
          setPoints((p) => ({ in: p.in !== null && p.in < time ? p.in : null, out: time }));
        else if (lower === 'c') change((m) => splitClip(m, time));
        else if (lower === 'm') change((m) => addChapterAt(m, time, `Chapter at ${clock(time)}`));
        else if (lower === 'z' && points.in !== null && points.out !== null) {
          const { in: from, out: to } = points;
          change((m) => addZoom(m, { start: from, end: to, scale: 1.5 }));
          setPoints({ in: null, out: null });
        } else if (key === 'Delete' || key === 'Backspace') deleteSelected();
        else if (key === 'Escape') select(null);
        else return false;
        return true;
      },
      [playback, time, manifest.duration, change, points, deleteSelected, select],
    ),
  );

  // Undo and redo (⌘Z / ⇧⌘Z, Ctrl+Z / Ctrl+Y). The shortcut hook ignores modified keys, and text
  // fields keep their native undo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]') !== null
      )
        return;
      const key = event.key.toLowerCase();
      if (key === 'z') (event.shiftKey ? redo : undo)();
      else if (key === 'y') redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="lessons-edit">
      <header className="lessons-edit__head">
        <button
          className="lessons-button lessons-button--quiet"
          onClick={() => leave('player')}
          type="button"
        >
          <Icon name="chevron-left" /> Lesson
        </button>
        <span className="lessons-edit__saved lessons-faint" data-state={saved}>
          {SAVED_WORDS[saved]}
        </span>
        <div className="lessons-edit__history">
          <button
            aria-label="Undo"
            className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
            disabled={!canUndo}
            onClick={undo}
            title={isMac() ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'}
            type="button"
          >
            <Icon name="undo" />
          </button>
          <button
            aria-label="Redo"
            className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
            disabled={!canRedo}
            onClick={redo}
            title={isMac() ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Shift+Z)'}
            type="button"
          >
            <Icon name="redo" />
          </button>
        </div>
        <div className="lessons-edit__actions">
          <button
            className="lessons-button"
            onClick={() =>
              void flush()
                .then(() => lessons.exportLesson(manifest.id))
                .catch((problem: unknown) =>
                  lessons.complain(problem, 'The lesson could not be exported.'),
                )
            }
            type="button"
          >
            <Icon name="export" /> Export…
          </button>
          <button
            className="lessons-button lessons-button--primary"
            onClick={() => leave('player')}
            type="button"
          >
            Done
          </button>
        </div>
      </header>
      <div className="lessons-edit__body">
        <div className="lessons-edit__stage">
          <Stage box={box} lesson={edited} playback={playback} />
        </div>
        <div className="lessons-edit__side">
          <Inspector
            chapters={playback.chapters}
            clips={clips}
            manifest={manifest}
            onChange={change}
            onPoints={setPoints}
            onRemoveBetween={removeBetween}
            onSeek={playback.seek}
            onSelect={select}
            points={points}
            selection={selection}
            time={time}
          />
          <EditChapters
            chapters={playback.chapters}
            current={playback.current}
            manifest={manifest}
            onChange={change}
            onSeek={playback.seek}
            time={time}
          />
          <EditDetails manifest={manifest} onChange={change} />
          {manifest.cameraType !== undefined && (
            <EditCamera manifest={manifest} onChange={change} onSeek={playback.seek} time={time} />
          )}
        </div>
      </div>
      <section aria-label="Timeline" className="lessons-edit__timeline">
        <div className="lessons-edit__transport">
          <button
            aria-label={playback.playing ? 'Pause' : 'Play'}
            className="lessons-button lessons-button--quiet lessons-button--icon"
            onClick={playback.toggle}
            type="button"
          >
            <Icon name={playback.playing ? 'pause' : 'play'} />
          </button>
          <span className="lessons-controls__time">
            {clockFine(time)}{' '}
            <span className="lessons-faint">/ {clock(Math.ceil(manifest.duration))}</span>
          </span>
          {playback.current !== undefined && (
            <span className="lessons-dim lessons-edit__current">{playback.current.title}</span>
          )}
          <span className="lessons-controls__spacer" />
          <button
            aria-pressed={skipCuts}
            className="lessons-button lessons-button--quiet lessons-button--small"
            onClick={() => setSkipCuts((on) => !on)}
            title="Play it as the learner will see it, skipping the stretches you cut"
            type="button"
          >
            <Icon name="scissors" /> Play with cuts
          </button>
          <button
            className="lessons-button lessons-button--quiet lessons-button--small"
            onClick={() => change((m) => splitClip(m, time))}
            title="Split the clip at the playhead (C)"
            type="button"
          >
            <Icon name="split" /> Split
          </button>
          <button
            className="lessons-button lessons-button--quiet lessons-button--small"
            onClick={() => change((m) => addChapterAt(m, time, `Chapter at ${clock(time)}`))}
            title="Add a chapter at the playhead (M)"
            type="button"
          >
            <Icon name="flag" /> Chapter
          </button>
        </div>
        <Timeline
          chapters={playback.chapters}
          clips={clips}
          current={playback.current}
          manifest={manifest}
          onMoveChapter={(index, at) => change((m) => moveChapter(m, index, at), `move:${index}`)}
          onSeek={playback.seek}
          onSelect={select}
          onTrim={(index, edge, at) =>
            change((m) => trimClip(m, index, edge, at), `trim:${index}:${edge}`)
          }
          playing={playback.playing}
          points={points}
          selection={selection}
          time={time}
        />
      </section>
    </div>
  );
}

export type { LessonManifest };
