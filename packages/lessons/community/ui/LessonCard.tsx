/** A community lesson card. Its main action is Download, then progress, then Open. */

import { useRef, useState } from 'react';
import { CardMenu, type MenuPoint, menuPoint } from '../../src/home/CardMenu.js';
import { Icon } from '../../src/ui/Icon.js';
import type { CatalogEntry } from '../client/catalog.js';
import { downloadCommunityLesson } from '../client/client.js';
import { localIdFor, rememberDownload } from '../client/downloads.js';
import { saveLesson } from '../client/library.js';
import { type ReportReason, reportLesson } from '../client/server-info.js';
import type { Source } from '../client/sources.js';
import { formatChapters, formatDuration, formatSize, levelName } from './format.js';

type Download =
  | { state: 'idle' }
  | { state: 'busy'; fraction: number }
  | { state: 'saved'; localId: string };

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'disturbing', label: 'Disturbing or offensive' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'not-a-lesson', label: 'Not a lesson' },
  { value: 'other', label: 'Something else' },
];

export function LessonCard({
  source,
  entry,
  onOpen,
  onMessage,
}: {
  source: Source;
  entry: CatalogEntry;
  onOpen: (localId: string) => void;
  onMessage: (text: string, kind: 'info' | 'error') => void;
}) {
  const known = localIdFor(source, entry.id);
  const [download, setDownload] = useState<Download>(
    known === undefined ? { state: 'idle' } : { state: 'saved', localId: known },
  );
  const [menuAt, setMenuAt] = useState<MenuPoint | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);

  async function start() {
    setDownload({ state: 'busy', fraction: 0 });
    try {
      const lesson = await downloadCommunityLesson(source, entry, {
        onProgress: (fraction) => setDownload({ state: 'busy', fraction }),
      });
      await saveLesson(lesson);
      rememberDownload(source, entry.id, lesson.manifest.id);
      setDownload({ state: 'saved', localId: lesson.manifest.id });
    } catch (error) {
      setDownload({ state: 'idle' });
      onMessage(error instanceof Error ? error.message : 'The download failed.', 'error');
    }
  }

  async function report(reason: ReportReason) {
    try {
      await reportLesson(source, entry.id, reason);
      onMessage('Thanks. The server’s owner will look at this lesson.', 'info');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'The report failed.', 'error');
    }
  }

  const saved = download.state === 'saved' ? download.localId : null;
  const busy = download.state === 'busy';
  const act = () => {
    if (saved !== null) onOpen(saved);
    else if (!busy) void start();
  };
  const kind = [
    entry.author,
    ...(entry.level === undefined ? [] : [levelName(entry.level)]),
    formatChapters(entry.chapters),
    formatSize(entry.size),
  ].join(' · ');

  return (
    // The start page's card, as on Learn: the face downloads or opens; the ⋯ button or a
    // right-click opens the menu.
    // biome-ignore lint/a11y/noStaticElementInteractions: its controls are focusable
    <div
      className="tile lessons-tile cl-tile"
      data-saved={saved === null ? undefined : ''}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuAt(menuPoint(event.clientX, event.clientY));
      }}
      ref={card}
    >
      <button
        aria-label={`${saved === null ? 'Download' : 'Open'} ${entry.title}`}
        className="tile__face lessons-tile__face"
        onClick={act}
        title={entry.description}
        type="button"
      >
        <span className="lessons-poster lessons-poster--empty">
          <Icon name="lesson" size={32} />
        </span>
        {entry.description !== '' && <span className="cl-tile__about">{entry.description}</span>}
        <span className="cl-tile__act lessons-glass">
          {busy ? (
            <span
              aria-valuenow={Math.round(download.fraction * 100)}
              className="cl-progress"
              role="progressbar"
            >
              <span className="cl-progress__bar" style={{ width: `${download.fraction * 100}%` }} />
            </span>
          ) : (
            <>
              <Icon name={saved === null ? 'import' : 'check'} />
              {saved === null ? 'Download' : 'Open'}
            </>
          )}
        </span>
        <span className="lessons-card__length">{formatDuration(entry.duration)}</span>
      </button>

      <div className="tile__foot">
        <span className="tile__text">
          <span className="lessons-tile__name" title={entry.title}>
            {entry.title}
          </span>
          <span className="tile__when">{kind}</span>
        </span>
        <button
          aria-expanded={menuAt !== null}
          aria-haspopup="menu"
          aria-label={`More for ${entry.title}`}
          className="tile__more"
          onClick={(event) => {
            const here = event.currentTarget.getBoundingClientRect();
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
            { label: saved === null ? 'Download' : 'Open', onSelect: act },
            ...REASONS.map((reason) => ({
              label: `Report: ${reason.label}`,
              onSelect: () => void report(reason.value),
            })),
          ]}
          label={`Actions for ${entry.title}`}
          onClose={(byKey) => {
            setMenuAt(null);
            if (byKey) more.current?.focus();
          }}
          within={card}
        />
      )}
    </div>
  );
}
