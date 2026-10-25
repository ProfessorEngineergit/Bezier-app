/** The Lessons home: the lessons on this device, the one to continue, import and record. */

import './home.css';
import './cards.css';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useLessons } from '../app/context.js';
import { count } from '../format/clock.js';
import { matches } from '../format/summary.js';
import { Icon } from '../ui/Icon.js';
import { ContinueCard, pickContinue } from './ContinueCard.js';
import { DraftNotice } from './DraftNotice.js';
import { LessonCard } from './LessonCard.js';
import { type LevelChoice, LevelSwitch } from './LevelSwitch.js';
import { RecordSheet } from './RecordSheet.js';
import { useLibrary } from './useLibrary.js';

const ACCEPT = '.bezierlesson,.zip,application/zip';

export function Home({
  query = '',
  tools,
  after,
  ownTitle,
}: {
  query?: string;
  /** Extra toolbar content after the level switch, such as the community switch. */
  tools?: ReactNode;
  /** Content below this device's lessons, such as community lessons. */
  after?: ReactNode;
  /** Heading for this device's lessons when other lessons are listed too. */
  ownTitle?: string;
}) {
  const lessons = useLessons();
  const library = useLibrary();
  const [level, setLevel] = useState<LevelChoice>('all');
  const [recording, setRecording] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const importFiles = useCallback(
    async (files: Iterable<File>) => {
      const list = [...files];
      for (const file of list) {
        try {
          const lesson = await lessons.importPackage(file);
          if (list.length === 1) lessons.show({ kind: 'player', id: lesson.manifest.id });
          else lessons.notify(`Imported ${lesson.manifest.title}`, { tone: 'ok' });
        } catch (problem) {
          lessons.complain(problem, `${file.name} could not be read as a lesson.`);
        }
      }
    },
    [lessons],
  );

  useDropImport(setDragging, importFiles);

  const shown = library.lessons.filter(
    (lesson) => (level === 'all' || lesson.level === level) && matches(lesson, query),
  );
  const next = pickContinue(library.lessons, library.progress);
  const hasLessons = library.lessons.length > 0;
  const filtered = query !== '' || level !== 'all';

  return (
    <section className="library__section lessons-home">
      <header className="library__head">
        <h1>Learn</h1>
        <span className="library__count">
          {library.loading
            ? ''
            : filtered
              ? `${shown.length} of ${count(library.lessons.length, 'lesson')}`
              : count(library.lessons.length, 'lesson')}
        </span>
      </header>

      {library.drafts.map((draft) => (
        <DraftNotice draft={draft} key={draft.id} />
      ))}

      {/* No search field: the start page's search arrives as `query`. */}
      <div className="lessons-home__toolbar">
        {hasLessons && <LevelSwitch onChange={setLevel} value={level} />}
        {tools}
        <span className="lessons-home__gap" />
        <button
          className="library__action"
          onClick={() => fileInput.current?.click()}
          type="button"
        >
          <Icon name="import" /> Import…
        </button>
        <div className="lessons-menu-anchor">
          <button
            aria-expanded={recording}
            className="library__action library__action--primary"
            onClick={() => setRecording((open) => !open)}
            type="button"
          >
            <Icon name="record" /> Record
          </button>
          {recording && <RecordSheet onClose={() => setRecording(false)} />}
        </div>
      </div>

      {next !== null && !filtered && <ContinueCard lesson={next.lesson} progress={next.progress} />}

      {ownTitle !== undefined && (
        <header className="library__head library__head--sub">
          <h2>{ownTitle}</h2>
        </header>
      )}

      {library.loading ? (
        <p className="lessons-dim">Looking for lessons…</p>
      ) : !hasLessons ? (
        <section className="lessons-empty" aria-label="No lessons yet">
          <span className="lessons-empty__mark">
            <Icon name="lesson" size={24} />
          </span>
          <p className="lessons-empty__title">No lessons yet</p>
          <p className="lessons-dim">
            Import a <code>.bezierlesson</code> someone shared, drop one anywhere on this page, or
            record one in the editor.
          </p>
          <div className="lessons-empty__actions">
            <button
              className="lessons-button lessons-button--primary"
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              <Icon name="import" /> Import a lesson…
            </button>
            <button className="lessons-button" onClick={() => setRecording(true)} type="button">
              <Icon name="record" /> Record one
            </button>
          </div>
        </section>
      ) : (
        <div className="library__grid">
          {shown.length === 0 ? (
            <p className="lessons-dim lessons-home__none">No lessons match.</p>
          ) : (
            shown.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                progress={library.progress.get(lesson.id)}
              />
            ))
          )}
        </div>
      )}

      {after}

      {dragging && (
        <div className="lessons-drop">
          <span className="lessons-drop__label lessons-glass">
            <Icon name="import" /> Drop to import
          </span>
        </div>
      )}
      <input
        accept={ACCEPT}
        aria-label="Import a lesson package"
        hidden
        multiple
        onChange={(event) => {
          // Copy first: clearing the input empties its live FileList.
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) void importFiles(files);
        }}
        ref={fileInput}
        type="file"
      />
    </section>
  );
}

/** Makes the whole window a drop target for lesson packages, like the editor's stage. */
function useDropImport(
  setDragging: (dragging: boolean) => void,
  onFiles: (files: Iterable<File>) => Promise<void>,
) {
  useEffect(() => {
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      void onFiles(event.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [setDragging, onFiles]);
}
