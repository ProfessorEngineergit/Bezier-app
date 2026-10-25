import { useEffect, useId, useRef, useState } from 'react';
import { useLessons } from '../app/context.js';
import type { LessonLevel } from '../format/manifest.js';
import { LEVELS, levelWord } from '../format/summary.js';
import { recordingWorks } from '../record/recorder.js';
import { Icon } from '../ui/Icon.js';

/** Settings chosen before recording; everything else is edited afterwards. */
export function RecordSheet({ onClose }: { onClose: () => void }) {
  // Null while checking, which takes about a second.
  const [recordable, setRecordable] = useState<boolean | null>(null);
  const lessons = useLessons();
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<LessonLevel>('beginner');
  const [microphone, setMicrophone] = useState(false);
  const [camera, setCamera] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [startEmpty, setStartEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLFormElement>(null);
  const titleId = useId();

  useEffect(() => {
    void recordingWorks().then(setRecordable);
  }, []);

  useEffect(() => {
    void lessons.host.snapshot().then((project) => setProjectOpen(project !== null));
    sheet.current?.querySelector('input')?.focus();
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && !sheet.current?.contains(event.target)) onClose();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', onEscape);
    };
  }, [lessons, onClose]);

  const start = () => {
    setBusy(true);
    void lessons
      .record({ title, level, microphone, camera, startEmpty: startEmpty || !projectOpen })
      .then(onClose)
      .catch((problem: unknown) => {
        setBusy(false);
        lessons.complain(problem, 'The recording could not start.', 'editor');
        lessons.complain(problem, 'The recording could not start.');
      });
  };

  return (
    <form
      aria-label="Record a lesson"
      className="lessons-sheet lessons-glass"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
      ref={sheet}
    >
      <label className="lessons-field" htmlFor={titleId}>
        Title
        <input
          className="lessons-input"
          id={titleId}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What will they make?"
          value={title}
        />
      </label>
      <div className="lessons-field">
        Level
        <fieldset aria-label="Level" className="lessons-segmented">
          {LEVELS.map((option) => (
            <button
              aria-pressed={level === option}
              key={option}
              onClick={() => setLevel(option)}
              type="button"
            >
              {levelWord(option)}
            </button>
          ))}
        </fieldset>
      </div>
      <label className="lessons-check">
        <input
          checked={microphone}
          onChange={(e) => setMicrophone(e.target.checked)}
          type="checkbox"
        />
        <Icon name="microphone" /> Microphone
      </label>
      <label className="lessons-check">
        <input checked={camera} onChange={(e) => setCamera(e.target.checked)} type="checkbox" />
        <Icon name="camera" /> Your camera, in a corner
      </label>
      {projectOpen && (
        <div className="lessons-field">
          Record in
          <fieldset aria-label="Record in" className="lessons-segmented">
            <button aria-pressed={startEmpty} onClick={() => setStartEmpty(true)} type="button">
              An empty model
            </button>
            <button aria-pressed={!startEmpty} onClick={() => setStartEmpty(false)} type="button">
              The open project
            </button>
          </fieldset>
        </div>
      )}
      <p className="lessons-sheet__note">
        The editor's viewport, your keys and clicks, and a checkpoint of the model after every edit.
        Trim and name the chapters afterwards.
      </p>
      {recordable === false && (
        <p className="lessons-sheet__note" role="alert">
          This window cannot record the viewport: its video encoder produced nothing. Recording
          works in the Mac and Windows apps and in Chrome.
        </p>
      )}
      <button
        className="lessons-button lessons-button--primary"
        disabled={busy || recordable !== true}
        type="submit"
      >
        <Icon name="record" />
        {busy ? 'Starting…' : 'Start recording'}
      </button>
    </form>
  );
}
