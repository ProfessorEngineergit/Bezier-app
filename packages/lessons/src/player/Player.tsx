/**
 * The lesson player: video, chapter list, and a prominent button to open the model at the current
 * moment.
 */

import './player.css';
import './stage.css';
import './controls.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLessons } from '../app/context.js';
import { useLesson } from '../app/useLesson.js';
import { count, dateWords, lengthWords } from '../format/clock.js';
import { setCompleted } from '../format/edits.js';
import type { StoredLesson } from '../format/manifest.js';
import { levelWord } from '../format/summary.js';
import { clearProgress, loadProgress, saveProgress } from '../store/library.js';
import { ConfirmDelete } from '../ui/ConfirmDelete.js';
import { Icon } from '../ui/Icon.js';
import { Menu } from '../ui/Menu.js';
import { Chapters } from './Chapters.js';
import { Controls } from './Controls.js';
import { ShortcutHelp } from './ShortcutHelp.js';
import { Stage } from './Stage.js';
import { FramesProvider } from './useFrames.js';
import { useIdle } from './useIdle.js';
import { usePlayback } from './usePlayback.js';
import { useShortcuts } from './useShortcuts.js';

export function Player({ id, at }: { id: string; at: number | undefined }) {
  const { lesson, error, setLesson } = useLesson(id);
  const [resume, setResume] = useState<number | null>(at ?? null);

  useEffect(() => {
    if (at !== undefined) return;
    void loadProgress()
      .then((progress) => setResume(progress.get(id)?.time ?? 0))
      .catch(() => setResume(0));
  }, [id, at]);

  if (error !== null) {
    return (
      <div className="lessons-player">
        <BackToLessons />
        <p className="lessons-dim">{error}</p>
      </div>
    );
  }
  if (lesson === null || resume === null) {
    return (
      <div className="lessons-player">
        <BackToLessons />
        <p className="lessons-dim">Opening the lesson…</p>
      </div>
    );
  }
  return <Loaded lesson={lesson} setLesson={setLesson} startAt={resume} />;
}

function BackToLessons() {
  const lessons = useLessons();
  return (
    <button
      className="lessons-button lessons-button--quiet lessons-player__back"
      onClick={() => lessons.show({ kind: 'list' })}
      type="button"
    >
      <Icon name="chevron-left" /> Lessons
    </button>
  );
}

function Loaded({
  lesson,
  setLesson,
  startAt,
}: {
  lesson: StoredLesson;
  setLesson: (lesson: StoredLesson) => void;
  startAt: number;
}) {
  const lessons = useLessons();
  const { manifest } = lesson;
  const box = useRef<HTMLDivElement>(null);
  /** The stage and its floating controls; the full-screen element. */
  const screen = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const lastSaved = useRef(0);

  const complete = useCallback(
    (completed: boolean) => {
      const next = { ...lesson, manifest: setCompleted(manifest, completed) };
      setLesson(next);
      void lessons
        .saveManifest(next.manifest)
        .then(() => (completed ? clearProgress(manifest.id) : undefined))
        .then(() => {
          if (completed) lessons.notify('Lesson completed', { tone: 'ok' });
        })
        .catch((problem: unknown) => lessons.complain(problem, 'The lesson could not be saved.'));
    },
    [lesson, manifest, setLesson, lessons],
  );

  const playback = usePlayback(manifest, {
    startAt: Math.min(startAt, manifest.duration),
    skipRemoved: true,
    onEnded: () => {
      if (!manifest.completed) complete(true);
    },
  });
  const { time, playing } = playback;
  const idle = useIdle(screen, playing);

  // Save progress at most every five seconds while playing, and on every change while paused.
  useEffect(() => {
    if (manifest.completed || time < 1) return;
    const now = Date.now();
    if (playing && now - lastSaved.current < 5000) return;
    lastSaved.current = now;
    void saveProgress(manifest.id, time).catch(() => undefined);
  }, [time, playing, manifest.id, manifest.completed]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === screen.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement !== null) void document.exitFullscreen();
    else void screen.current?.requestFullscreen?.();
  }, []);

  useShortcuts(
    true,
    useCallback(
      (key) => {
        const lower = key.toLowerCase();
        if (key === ' ' || lower === 'k') playback.toggle();
        else if (lower === 'j') playback.seekBy(-10);
        else if (lower === 'l') playback.seekBy(10);
        else if (key === 'ArrowLeft') playback.seekBy(-5);
        else if (key === 'ArrowRight') playback.seekBy(5);
        else if (key === 'ArrowUp' || lower === 'p') playback.chapter(-1);
        else if (key === 'ArrowDown' || lower === 'n') playback.chapter(1);
        else if (key === 'Home') playback.seek(0);
        else if (key === 'End') playback.seek(manifest.duration);
        else if (/^[0-9]$/.test(key)) playback.seek((manifest.duration * Number(key)) / 10);
        else if (lower === 'r') playback.toggleRepeat();
        else if (lower === 'm') playback.toggleMute();
        else if (lower === 'f') toggleFullscreen();
        else if (key === '?') setHelp((open) => !open);
        else if (key === 'Escape' && help) setHelp(false);
        else return false;
        return true;
      },
      [playback, manifest.duration, toggleFullscreen, help],
    ),
  );

  return (
    <FramesProvider viewport={lesson.viewport}>
      <div className="lessons-player">
        <header className="lessons-player__head">
          <BackToLessons />
          <div className="lessons-player__actions">
            <button
              className="lessons-button"
              onClick={() =>
                void lessons
                  .follow(manifest.id, time)
                  .catch((problem: unknown) =>
                    lessons.complain(problem, 'The lesson could not be opened in the editor.'),
                  )
              }
              type="button"
            >
              <Icon name="follow" /> Follow along
            </button>
            <button
              className="lessons-button"
              onClick={() => lessons.show({ kind: 'edit', id: manifest.id })}
              type="button"
            >
              <Icon name="edit" /> Edit Lesson
            </button>
            <Menu
              items={[
                {
                  label: manifest.completed ? 'Mark as not completed' : 'Mark as completed',
                  icon: 'check',
                  onSelect: () => complete(!manifest.completed),
                },
                {
                  label: 'Export…',
                  icon: 'export',
                  onSelect: () =>
                    void lessons
                      .exportLesson(manifest.id)
                      .catch((problem: unknown) =>
                        lessons.complain(problem, 'The lesson could not be exported.'),
                      ),
                },
                {
                  label: 'Delete…',
                  icon: 'trash',
                  danger: true,
                  separated: true,
                  onSelect: () => setConfirming(true),
                },
              ]}
              label="More"
            />
            {confirming && (
              <ConfirmDelete
                onDelete={() =>
                  void lessons
                    .deleteLesson(manifest.id)
                    .then(() => lessons.notify(`Deleted ${manifest.title}`))
                    .catch((problem: unknown) =>
                      lessons.complain(problem, 'The lesson could not be deleted.'),
                    )
                }
                onKeep={() => setConfirming(false)}
                title={manifest.title}
              />
            )}
          </div>
        </header>
        <h1 className="lessons-brand lessons-player__title">{manifest.title}</h1>
        <p className="lessons-player__meta lessons-dim">
          {levelWord(manifest.level)} · {lengthWords(playback.playable)} ·{' '}
          {count(manifest.states.length, 'chapter')} · {dateWords(manifest.createdAt)}
          {manifest.completed && (
            <span className="lessons-player__done">
              <Icon name="check" /> Completed
            </span>
          )}
        </p>
        {manifest.description !== '' && (
          <p className="lessons-player__description">{manifest.description}</p>
        )}
        <div className="lessons-player__body">
          <div className="lessons-player__main">
            <div className="lessons-player__stage" data-idle={idle ? '' : undefined} ref={screen}>
              <Stage
                box={box}
                lesson={lesson}
                onDoubleClick={toggleFullscreen}
                playback={playback}
              />
              {playback.current !== undefined && (
                <span className="lessons-player__chip lessons-glass">
                  <span className="lessons-label">
                    {playback.current.index + 1} / {playback.chapters.length}
                  </span>
                  {playback.current.title}
                </span>
              )}
              <div className="lessons-player__bar lessons-glass">
                <Controls
                  fullscreen={fullscreen}
                  onFullscreen={toggleFullscreen}
                  onHelp={() => setHelp((open) => !open)}
                  playback={playback}
                />
              </div>
              {help && <ShortcutHelp onClose={() => setHelp(false)} />}
            </div>
          </div>
          <Chapters
            chapters={playback.chapters}
            current={playback.current}
            manifest={manifest}
            onSeek={(chapter) => playback.seek(chapter.time)}
          />
        </div>
      </div>
    </FramesProvider>
  );
}
