/**
 * The recording bar over the editor: indicator, time, Pause, Checkpoint and Finish. Discard is
 * offered while paused.
 */

import './record.css';
import { useState } from 'react';
import { useLessons } from '../app/context.js';
import { useObservable } from '../app/observable.js';
import { clock } from '../format/clock.js';
import { Icon } from '../ui/Icon.js';
import type { RecordingSession } from './recorder.js';

export function RecordingBar({ session }: { session: RecordingSession }) {
  const lessons = useLessons();
  const status = useObservable(session.status);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const finish = () => {
    setSaving(true);
    void lessons.finishRecording().catch((problem: unknown) => {
      setSaving(false);
      lessons.complain(problem, 'The recording could not be saved.', 'editor');
    });
  };
  const discard = () => {
    void lessons
      .cancelRecording()
      .catch((problem: unknown) =>
        lessons.complain(problem, 'The recording could not be discarded.', 'editor'),
      );
  };

  return (
    <div
      aria-label="Recording"
      className="lessons-recording lessons-glass"
      data-paused={status.paused ? '' : undefined}
      role="status"
    >
      <span className="lessons-recording__dot" />
      <span className="lessons-recording__time">
        {status.paused && <span className="lessons-dim">Paused </span>}
        {clock(status.elapsed)}
      </span>
      {status.error !== null && <span className="lessons-recording__error">{status.error}</span>}
      {saving ? (
        <span className="lessons-dim">Saving…</span>
      ) : confirmDiscard ? (
        <>
          <span>Discard this recording?</span>
          <button
            className="lessons-button lessons-button--small lessons-button--danger"
            onClick={discard}
            type="button"
          >
            Discard
          </button>
          <button
            className="lessons-button lessons-button--small"
            onClick={() => setConfirmDiscard(false)}
            type="button"
          >
            Keep
          </button>
        </>
      ) : (
        <>
          <button
            className="lessons-button lessons-button--small"
            onClick={status.paused ? session.resume : session.pause}
            type="button"
          >
            <Icon name={status.paused ? 'play' : 'pause'} />
            {status.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            className="lessons-button lessons-button--small"
            disabled={status.paused}
            onClick={() =>
              void session
                .addCheckpoint()
                .catch((problem: unknown) =>
                  lessons.complain(problem, 'The checkpoint could not be taken.', 'editor'),
                )
            }
            title="Keep the model as it is now, as a chapter"
            type="button"
          >
            <Icon name="checkpoint" />
            Checkpoint
            <span className="lessons-recording__count">{status.checkpoints}</span>
          </button>
          {status.paused && (
            <button
              className="lessons-button lessons-button--small lessons-button--quiet"
              onClick={() => setConfirmDiscard(true)}
              type="button"
            >
              Discard…
            </button>
          )}
          <button
            className="lessons-button lessons-button--small lessons-button--primary"
            onClick={finish}
            type="button"
          >
            Finish
          </button>
        </>
      )}
    </div>
  );
}
