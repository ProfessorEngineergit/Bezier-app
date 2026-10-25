import { useState } from 'react';
import { useLessons } from '../app/context.js';
import { clock } from '../format/clock.js';
import type { Draft } from '../record/drafts.js';
import { Icon } from '../ui/Icon.js';

/** Offers to keep or discard a recording that was interrupted by a reload. */
export function DraftNotice({ draft }: { draft: Draft }) {
  const lessons = useLessons();
  const [busy, setBusy] = useState(false);
  const run = (work: Promise<void>, fallback: string) => {
    setBusy(true);
    void work
      .catch((problem: unknown) => lessons.complain(problem, fallback))
      .finally(() => setBusy(false));
  };
  return (
    <section aria-label="Interrupted recording" className="lessons-draft">
      <span className="lessons-draft__mark">
        <Icon name="record" />
      </span>
      <p>
        <strong>{draft.title.trim() || 'Untitled lesson'}</strong> was being recorded when the app
        was reloaded. {clock(draft.elapsed)} of it is safe.
      </p>
      <div className="lessons-draft__actions">
        <button
          className="lessons-button lessons-button--small lessons-button--primary"
          disabled={busy}
          onClick={() => run(lessons.keepDraft(draft), 'The recording could not be kept.')}
          type="button"
        >
          Keep as a lesson
        </button>
        <button
          className="lessons-button lessons-button--small"
          disabled={busy}
          onClick={() => run(lessons.discardDraft(draft), 'The recording could not be discarded.')}
          type="button"
        >
          Discard
        </button>
      </div>
    </section>
  );
}
