import { clock } from '../format/clock.js';
import { shortcutsUsed } from '../format/events.js';
import type { LessonManifest } from '../format/manifest.js';
import type { Chapter } from '../format/timeline.js';
import { isMac } from '../ui/platform.js';
import { useFrames } from './useFrames.js';

interface Props {
  manifest: LessonManifest;
  chapters: readonly Chapter[];
  current: Chapter | undefined;
  onSeek: (chapter: Chapter) => void;
}

/** The chapter list. Each row seeks to its chapter and can open its model. */
export function Chapters({ manifest, chapters, current, onSeek }: Props) {
  const shortcuts = shortcutsUsed(manifest.events, isMac()).slice(0, 8);
  const frames = useFrames();
  return (
    <aside aria-label="Chapters" className="lessons-chapters">
      <p className="lessons-label">Chapters</p>
      <ol className="lessons-chapters__list">
        {chapters.map((chapter) => (
          <li
            aria-current={chapter.index === current?.index ? 'step' : undefined}
            className="lessons-chapter"
            key={`${chapter.index}-${chapter.time}`}
            onPointerEnter={() => frames?.ask(chapter.time)}
          >
            {(() => {
              const frame = frames?.look(chapter.time) ?? null;
              return frame === null ? null : (
                <img alt="" className="lessons-chapter__frame" src={frame} />
              );
            })()}
            <button className="lessons-chapter__seek" onClick={() => onSeek(chapter)} type="button">
              <span className="lessons-chapter__index">{chapter.index + 1}</span>
              <span className="lessons-chapter__title">{chapter.title}</span>
              <span className="lessons-chapter__time">{clock(chapter.playback)}</span>
            </button>
          </li>
        ))}
      </ol>
      {shortcuts.length > 0 && (
        <div className="lessons-shortcuts">
          <p className="lessons-label">Keys the author uses</p>
          <ul className="lessons-shortcuts__list">
            {shortcuts.map((shortcut) => (
              <li key={shortcut.label}>
                <kbd className="lessons-kbd">{shortcut.label}</kbd>
                <span className="lessons-faint">×{shortcut.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
