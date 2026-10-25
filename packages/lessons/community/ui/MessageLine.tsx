/**
 * The message line under the title bar (docs/DESIGN.md). Info messages time out; errors stay until
 * dismissed.
 */

import { useEffect } from 'react';
import { CloseIcon } from './icons.js';

export interface Message {
  text: string;
  kind: 'info' | 'error';
  /** Distinguishes two identical messages so the second restarts the timer. */
  at: number;
}

const INFO_MS = 4_000;

export function MessageLine({
  message,
  onDismiss,
}: {
  message: Message | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (message === null || message.kind === 'error') return;
    const timer = setTimeout(onDismiss, INFO_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (message === null) return null;
  return (
    <div
      className={`cl-message cl-message--${message.kind}`}
      role={message.kind === 'error' ? 'alert' : 'status'}
    >
      <span>{message.text}</span>
      {message.kind === 'error' ? (
        <button type="button" className="cl-icon-button" aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon />
        </button>
      ) : null}
    </div>
  );
}
