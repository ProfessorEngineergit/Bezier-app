/**
 * A lesson card on the Learn page. Reuses the start page's project card classes (`tile` in the
 * studio's library.css) so both stay consistent. The picture opens the lesson; the ⋯ button or a
 * right-click opens the menu.
 */

import { useRef, useState } from 'react';
import { useLessons } from '../app/context.js';
import { clock, count, lengthWords } from '../format/clock.js';
import { type LessonSummary, levelWord } from '../format/summary.js';
import type { Progress } from '../store/library.js';
import { ConfirmDelete } from '../ui/ConfirmDelete.js';
import { Icon } from '../ui/Icon.js';
import { PlayChip } from '../ui/PlayChip.js';
import { CardMenu, type MenuPoint, menuPoint } from './CardMenu.js';
import { useHoverPreview } from './useHoverPreview.js';
import { usePoster } from './usePoster.js';

export function Poster({ id, title }: { id: string; title: string }) {
  const url = usePoster(id);
  return url === null ? (
    <span className="lessons-poster lessons-poster--empty">
      <Icon name="lesson" size={32} />
    </span>
  ) : (
    <img alt={`A frame of ${title}`} className="lessons-poster" draggable={false} src={url} />
  );
}

export function LessonCard({
  lesson,
  progress,
}: {
  lesson: LessonSummary;
  progress: Progress | undefined;
}) {
  const lessons = useLessons();
  const [confirming, setConfirming] = useState(false);
  const [menuAt, setMenuAt] = useState<MenuPoint | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLButtonElement>(null);
  const preview = useHoverPreview({ id: lesson.id, surface });
  const fraction =
    progress !== undefined && lesson.length > 0 ? Math.min(1, progress.time / lesson.length) : 0;

  const open = () => lessons.show({ kind: 'player', id: lesson.id });
  const complain = (fallback: string) => (problem: unknown) => lessons.complain(problem, fallback);
  const remove = () => {
    setConfirming(false);
    void lessons
      .deleteLesson(lesson.id)
      .then(() => lessons.notify(`Deleted ${lesson.title}`))
      .catch(complain('The lesson could not be deleted.'));
  };

  return (
    // Right-click on the card opens the menu, as on a project card; keyboard users use the ⋯
    // button.
    // biome-ignore lint/a11y/noStaticElementInteractions: its controls are focusable
    <div
      className="tile lessons-tile"
      data-lesson=""
      data-completed={lesson.completed ? '' : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuAt(menuPoint(event.clientX, event.clientY));
      }}
      ref={card}
    >
      <button
        aria-label={`Play ${lesson.title}`}
        className="tile__face lessons-tile__face"
        data-previewing={preview.previewing ? '' : undefined}
        onClick={open}
        ref={surface}
        type="button"
        {...preview.bind}
      >
        <Poster id={lesson.id} title={lesson.title} />
        {preview.layer}
        <PlayChip />
        <span className="lessons-card__length">
          {lesson.completed ? <Icon name="check" /> : null}
          {clock(lesson.length)}
        </span>
        {fraction > 0 && !lesson.completed && (
          <span className="lessons-card__progress" style={{ width: `${fraction * 100}%` }} />
        )}
      </button>

      <div className="tile__foot">
        <span className="tile__text">
          <span className="lessons-tile__name" title={lesson.title}>
            {lesson.title}
          </span>
          <span className="tile__when">
            {levelWord(lesson.level)} · {lengthWords(lesson.length)} ·{' '}
            {count(lesson.chapters.length, 'chapter')}
            {lesson.hasCamera ? ' · Camera' : ''}
          </span>
        </span>
        <button
          aria-expanded={menuAt !== null}
          aria-haspopup="menu"
          aria-label={`More for ${lesson.title}`}
          className="tile__more"
          onClick={(event) => {
            const here = event.currentTarget.getBoundingClientRect();
            // `detail` is 0 for clicks from the keyboard.
            setMenuAt(
              menuAt === null
                ? menuPoint(here.right - 184, here.bottom + 4, event.detail === 0)
                : null,
            );
          }}
          ref={more}
          type="button"
        >
          <Icon name="more" />
        </button>
      </div>

      {menuAt !== null && (
        <CardMenu
          at={menuAt}
          items={[
            { label: 'Play', onSelect: open },
            {
              label: 'Follow Along in the Editor',
              onSelect: () =>
                void lessons
                  .follow(lesson.id, progress?.time ?? 0)
                  .catch(complain('The lesson could not be opened.')),
            },
            {
              label: 'Export…',
              onSelect: () =>
                void lessons
                  .exportLesson(lesson.id)
                  .catch(complain('The lesson could not be exported.')),
            },
            { label: 'Delete…', destructive: true, onSelect: () => setConfirming(true) },
          ]}
          label={`Actions for ${lesson.title}`}
          onClose={(byKey) => {
            setMenuAt(null);
            if (byKey) more.current?.focus();
          }}
          within={card}
        />
      )}
      {confirming && (
        <ConfirmDelete onDelete={remove} onKeep={() => setConfirming(false)} title={lesson.title} />
      )}
    </div>
  );
}
