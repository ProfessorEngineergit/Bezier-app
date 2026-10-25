/**
 * Toast notices, stacked under the title bar. Each expires on its own (by tone) and hover pauses
 * it; the timer is a CSS animation, so its end is the animation's end. `sticky` notices stay until
 * dismissed. Any notice can be dismissed by click, by dragging it away, or by a wheel/trackpad
 * swipe over it.
 */

/// <reference lib="dom" />

import {
  type AnimationEvent,
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { Notice, Tone } from './notification-types.js';

/**
 * Wheel or trackpad travel over a notice that dismisses it; more than a resting finger produces.
 */
const SWIPED_AWAY = 24;

/** Drag distance in pixels beyond which releasing dismisses a notice. */
const PUSHED_AWAY = 36;

/** Lifetime per tone, in milliseconds. */
const LIFE: Readonly<Record<Tone, number>> = { info: 4500, ok: 3000, fail: 9000 };

/** Maximum number of non-sticky notices shown at once. */
const MOST = 4;

const saysTheSame = (a: Notice, b: Notice) =>
  a.title === b.title && a.detail === b.detail && (a.tone ?? 'info') === (b.tone ?? 'info');

export interface ToastsProps {
  notices: readonly Notice[];
  onDismiss: (id: string) => void;
}

export function Toasts({ notices, onDismiss }: ToastsProps) {
  // Newest at the bottom; each expires on its own. Beyond MOST the oldest non-sticky ones are
  // dismissed. Duplicates collapse to the latest, which gets its full lifetime.
  useEffect(() => {
    const passing = notices.filter((notice) => notice.sticky !== true);
    const repeats = passing.filter((notice, index) =>
      passing.slice(index + 1).some((later) => saysTheSame(notice, later)),
    );
    for (const notice of repeats) onDismiss(notice.id);
    const kept = passing.filter((notice) => !repeats.includes(notice));
    for (const notice of kept.slice(0, Math.max(0, kept.length - MOST))) onDismiss(notice.id);
  }, [notices, onDismiss]);
  const shown = notices
    .filter(
      (notice, index) => !notices.slice(index + 1).some((later) => saysTheSame(notice, later)),
    )
    .slice(-MOST - 1);
  // Portal to the body: the title bar's `backdrop-filter` would make a fixed child fixed to the
  // bar.
  return createPortal(
    <section aria-label="Notifications" aria-live="polite" className="toasts">
      {shown.map((notice) => (
        <Toast key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </section>,
    document.body,
  );
}

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const tone = notice.tone ?? 'info';
  /** Accumulated wheel/trackpad travel over the notice. */
  const swiped = useRef(0);
  /** Press start position while the notice is held. */
  const held = useRef<{ x: number; y: number } | null>(null);
  const push = (event: PointerEvent<HTMLDivElement>) => {
    const from = held.current;
    if (from === null) return;
    const element = event.currentTarget;
    element.style.translate = `${event.clientX - from.x}px ${event.clientY - from.y}px`;
    element.style.opacity = String(
      Math.max(
        0.3,
        1 - Math.hypot(event.clientX - from.x, event.clientY - from.y) / PUSHED_AWAY / 2,
      ),
    );
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    const from = held.current;
    held.current = null;
    if (from === null) return;
    const far = Math.hypot(event.clientX - from.x, event.clientY - from.y);
    // Released in place: a click. Dragged far enough: dismissed. In between: it snaps back.
    if (far < 4 || far >= PUSHED_AWAY) {
      setLeaving(true);
      return;
    }
    event.currentTarget.style.translate = '';
    event.currentTarget.style.opacity = '';
  };
  const ended = (event: AnimationEvent<HTMLElement>) => {
    if (event.animationName === 'toast-life') setLeaving(true);
    if (event.animationName === 'toast-out') onDismiss(notice.id);
  };
  return (
    <div
      className="toast"
      data-leaving={leaving ? '' : undefined}
      data-sticky={notice.sticky === true ? '' : undefined}
      data-tone={tone}
      onAnimationEnd={ended}
      onPointerCancel={release}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        held.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={push}
      onPointerUp={release}
      // A trackpad swipe or wheel turn over the notice dismisses it.
      onWheel={(event) => {
        swiped.current += Math.abs(event.deltaX) + Math.abs(event.deltaY);
        if (swiped.current >= SWIPED_AWAY) setLeaving(true);
      }}
      role={tone === 'fail' ? 'alert' : 'status'}
      style={{ '--toast-life': `${LIFE[tone]}ms` } as CSSProperties}
    >
      <ToneMark tone={tone} />
      <div className="toast__text">
        <p className="toast__title">{notice.title}</p>
        {notice.detail !== undefined && <p className="toast__detail">{notice.detail}</p>}
      </div>
      {/* Only sticky notices show a close button; others expire. */}
      {notice.sticky === true && (
        <button
          aria-label={`Dismiss: ${notice.title}`}
          className="toast__close"
          onClick={() => setLeaving(true)}
          type="button"
        >
          <svg aria-hidden="true" height="10" viewBox="0 0 10 10" width="10">
            <path
              d="M2 2l6 6M8 2l-6 6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      )}
      {notice.sticky !== true && <span aria-hidden="true" className="toast__life" />}
    </div>
  );
}

/** Icon for the notice's tone. */
function ToneMark({ tone }: { tone: Tone }) {
  return (
    <svg aria-hidden="true" className="toast__mark" height="14" viewBox="0 0 16 16" width="14">
      <circle cx="8" cy="8" fill="currentColor" r="8" />
      {tone === 'ok' && (
        <path
          d="M4.6 8.3l2.2 2.2 4.6-4.8"
          fill="none"
          stroke="var(--toast-mark-ink)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      )}
      {tone === 'fail' && (
        <path
          d="M8 4.2v4.6M8 11.3v.2"
          stroke="var(--toast-mark-ink)"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      )}
      {tone === 'info' && (
        <path
          d="M8 7.2v4.3M8 4.6v.2"
          stroke="var(--toast-mark-ink)"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      )}
    </svg>
  );
}
