import { useRef } from 'react';
import { useLessons } from '../app/context.js';
import { clock } from '../format/clock.js';
import type { LessonSummary } from '../format/summary.js';
import type { Progress } from '../store/library.js';
import { Icon } from '../ui/Icon.js';
import { PlayChip } from '../ui/PlayChip.js';
import { Poster } from './LessonCard.js';
import { useHoverPreview } from './useHoverPreview.js';

/** The most recently watched unfinished lesson and its progress, or null. */
export function pickContinue(
  lessons: readonly LessonSummary[],
  progress: Map<string, Progress>,
): { lesson: LessonSummary; progress: Progress } | null {
  let best: { lesson: LessonSummary; progress: Progress } | null = null;
  for (const lesson of lessons) {
    const at = progress.get(lesson.id);
    // Counts as started after three seconds, or a tenth of a short lesson.
    if (at === undefined || lesson.completed || at.time < Math.min(3, lesson.length / 10)) continue;
    if (best === null || at.updatedAt > best.progress.updatedAt) best = { lesson, progress: at };
  }
  return best;
}

/** A horizontal version of the lesson card, with the poster beside the text. */
export function ContinueCard({ lesson, progress }: { lesson: LessonSummary; progress: Progress }) {
  const app = useLessons();
  const surface = useRef<HTMLSpanElement>(null);
  const preview = useHoverPreview({ id: lesson.id, startAt: progress.time, surface });
  const chapter = [...lesson.chapters].reverse().find((c) => c.time <= progress.time + 0.05);
  const index = chapter === undefined ? 0 : lesson.chapters.indexOf(chapter) + 1;
  const fraction = lesson.length > 0 ? Math.min(1, progress.time / lesson.length) : 0;
  return (
    <section aria-label="Continue" className="lessons-continue">
      <p className="lessons-label lessons-home__section">Continue</p>
      <button
        className="lessons-continue__open"
        data-previewing={preview.previewing ? '' : undefined}
        onClick={() => app.show({ kind: 'player', id: lesson.id, at: progress.time })}
        type="button"
        {...preview.bind}
      >
        <span className="lessons-continue__poster" ref={surface}>
          <Poster id={lesson.id} title={lesson.title} />
          {preview.layer}
          <PlayChip persistent size={56} />
          <span className="lessons-card__progress" style={{ width: `${fraction * 100}%` }} />
        </span>
        <span className="lessons-continue__text">
          <span className="lessons-continue__title">{lesson.title}</span>
          <span className="lessons-continue__where">
            {chapter !== undefined && `Chapter ${index} · ${chapter.title} · `}
            {clock(progress.time)} of {clock(lesson.length)}
          </span>
          <span className="lessons-continue__go">
            Pick up where you left off <Icon name="chevron-right" />
          </span>
        </span>
      </button>
    </section>
  );
}
