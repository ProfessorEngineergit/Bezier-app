/**
 * Community lessons on the Learn page, listed below the local lessons when the user enables them
 * with the switch in Learn's toolbar.
 */

import { useCallback, useMemo, useState } from 'react';
import { reaches } from '../client/channel.js';
import { lessonsOf } from '../client/store.js';
import { UploadIcon } from './icons.js';
import { LessonCard } from './LessonCard.js';
import { type Message, MessageLine } from './MessageLine.js';
import { UploadDialog } from './UploadDialog.js';
import { useCatalog } from './useCatalog.js';
import { useChannel } from './useChannel.js';
import { useCommunityStore } from './useStore.js';
import './community.css';
import './community-parts.css';
import './community-dialog.css';

/** Whether community lessons are available: the store is on and the channel is alpha. */
export function useCommunityLessonsAvailable(): boolean {
  const store = useCommunityStore();
  const channel = useChannel();
  return store.on && reaches(channel, 'alpha');
}

export function CommunityLessons({
  onOpenLesson,
  query = '',
}: {
  onOpenLesson: (localId: string) => void;
  query?: string;
}) {
  const store = useCommunityStore();
  // Memoised: the catalogue refetches whenever `source` changes identity.
  const source = useMemo(() => lessonsOf(store), [store]);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const catalog = useCatalog(source, query, null);
  const say = useCallback(
    (text: string, kind: Message['kind']) => setMessage({ text, kind, at: Date.now() }),
    [],
  );
  const dismiss = useCallback(() => setMessage(null), []);

  return (
    <section
      aria-label="Community lessons"
      className="library__section library__section--after cl-root"
    >
      <header className="library__head">
        <h2>From the community</h2>
        {/* The head's right cell: the store name and Share. */}
        <span className="cl-head-end">
          <span className="library__count">{source.name}</span>
          <button className="library__action" onClick={() => setSharing(true)} type="button">
            <UploadIcon /> Share a lesson
          </button>
        </span>
      </header>
      <MessageLine message={message} onDismiss={dismiss} />
      {catalog.error !== null && (
        <div className="cl-inline-error" role="alert">
          <span>{catalog.error}</span>
          <button className="cl-text-button" onClick={catalog.retry} type="button">
            Try again
          </button>
        </div>
      )}
      <div aria-busy={catalog.loading} className="library__grid">
        {catalog.lessons.map((entry) => (
          <LessonCard
            entry={entry}
            key={entry.id}
            onMessage={say}
            onOpen={onOpenLesson}
            source={source}
          />
        ))}
        {!catalog.loading && catalog.error === null && catalog.lessons.length === 0 && (
          <p className="lessons-dim lessons-home__none">
            {query.trim() !== ''
              ? 'No community lessons match.'
              : 'Nobody has shared a lesson yet.'}
          </p>
        )}
      </div>
      {catalog.loading && <p className="lessons-dim">Looking for lessons…</p>}
      {catalog.hasMore && !catalog.loading && (
        <button className="library__action cl-more" onClick={catalog.loadMore} type="button">
          Show more
        </button>
      )}
      {sharing && <UploadDialog onClose={() => setSharing(false)} source={source} />}
    </section>
  );
}
