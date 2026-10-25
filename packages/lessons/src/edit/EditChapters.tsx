import { clock } from '../format/clock.js';
import { addChapterAt, canRemoveChapter, removeChapter, renameChapter } from '../format/edits.js';
import type { LessonManifest } from '../format/manifest.js';
import type { Chapter } from '../format/timeline.js';
import { Icon } from '../ui/Icon.js';

interface Props {
  manifest: LessonManifest;
  chapters: readonly Chapter[];
  current: Chapter | undefined;
  /** The playhead, in lesson time. */
  time: number;
  onSeek: (time: number) => void;
  onChange: (edit: (manifest: LessonManifest) => LessonManifest, group?: string) => void;
}

/** Lists chapters for renaming and removal, and adds one at the playhead. */
export function EditChapters({ manifest, chapters, current, time, onSeek, onChange }: Props) {
  return (
    <section aria-label="Chapters" className="lessons-edit__section">
      <div className="lessons-edit__section-head">
        <p className="lessons-label">Chapters</p>
        <button
          className="lessons-button lessons-button--small"
          onClick={() => onChange((m) => addChapterAt(m, time, `Chapter at ${clock(time)}`))}
          type="button"
        >
          <Icon name="plus" /> Chapter at {clock(time)}
        </button>
      </div>
      <ol className="lessons-edit__chapters">
        {chapters.map((chapter) => (
          <li
            aria-current={chapter.index === current?.index ? 'step' : undefined}
            className="lessons-edit__chapter"
            key={`${chapter.index}-${chapter.time}`}
          >
            <button
              aria-label={`Go to ${clock(chapter.time)}`}
              className="lessons-edit__chapter-time"
              onClick={() => onSeek(chapter.time)}
              type="button"
            >
              {clock(chapter.time)}
            </button>
            <input
              aria-label={`Name of chapter ${chapter.index + 1}`}
              className="lessons-input"
              onChange={(event) =>
                onChange(
                  (m) => renameChapter(m, chapter.index, event.target.value),
                  `name:${chapter.index}`,
                )
              }
              value={chapter.title}
            />
            <button
              aria-label={`Remove chapter ${chapter.index + 1}`}
              className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
              disabled={!canRemoveChapter(manifest, chapter.index)}
              onClick={() => onChange((m) => removeChapter(m, chapter.index))}
              title={
                chapter.index === 0
                  ? 'The first chapter is the model the lesson starts from'
                  : 'Remove this chapter'
              }
              type="button"
            >
              <Icon name="close" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
