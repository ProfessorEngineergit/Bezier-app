import { Icon } from '../ui/Icon.js';
import { useLessons, useLessonsState } from './context.js';

/**
 * A single notice line. Info notices time out; errors stay until dismissed with the button or a
 * click on the line.
 */
export function NoticeLine({ over }: { over: 'home' | 'editor' }) {
  const lessons = useLessons();
  const { notice } = useLessonsState();
  if (notice === null || notice.over !== over) return null;
  return (
    // A click anywhere on the line dismisses it, like the editor's own notices.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the Dismiss button covers keyboard use
    // biome-ignore lint/a11y/noStaticElementInteractions: see above
    <div
      className="lessons-notice"
      data-tone={notice.tone}
      key={notice.key}
      onClick={lessons.dismissNotice}
      role={notice.tone === 'fail' ? 'alert' : 'status'}
    >
      <span className="lessons-notice__mark">
        <Icon name={notice.tone === 'ok' ? 'check' : 'info'} />
      </span>
      <span className="lessons-notice__text">
        <span className="lessons-notice__title">{notice.text}</span>
        {notice.detail !== undefined && (
          <span className="lessons-notice__detail">{notice.detail}</span>
        )}
      </span>
      <button
        aria-label="Dismiss"
        className="lessons-notice__close"
        onClick={lessons.dismissNotice}
        type="button"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
