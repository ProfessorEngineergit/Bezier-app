/**
 * A floating window over the app, moved by its bar and resized from any corner. Shares the wiki
 * window's classes (`wiki.css`) and placement rules (`placeOnScreen`).
 */

import { CrossIcon } from '@bezier/ui';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { placeOnScreen } from './floating-place.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
type Corner = (typeof CORNERS)[number];

/** The rect after dragging `corner` by (dx, dy), with the opposite corner fixed. */
function sized(start: Rect, corner: Corner, dx: number, dy: number, least: Rect): Rect {
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const width = Math.max(least.width, start.width + (west ? -dx : dx));
  const height = Math.max(least.height, start.height + (north ? -dy : dy));
  return {
    width,
    height,
    x: west ? start.x + start.width - width : start.x,
    y: north ? start.y + start.height - height : start.y,
  };
}

export function FloatingWindow({
  title,
  label,
  onClose,
  initial,
  least = { x: 0, y: 0, width: 340, height: 300 },
  actions,
  children,
}: {
  title: string;
  /** Accessible name of the window. */
  label: string;
  onClose: () => void;
  /** Initial position; defaults to the lower right, clear of the rails. */
  initial?: Rect;
  least?: Rect;
  /** Shown beside the close button in the bar. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const element = useRef<HTMLElement>(null);
  const moving = useRef<{ dx: number; dy: number } | null>(null);
  const sizing = useRef<{ x: number; y: number; start: Rect; corner: Corner } | null>(null);
  const [wanted, setWanted] = useState<Rect>(
    () =>
      initial ?? {
        width: 400,
        height: Math.min(660, window.innerHeight - 80),
        x: window.innerWidth - 400 - 72,
        y: 60,
      },
  );
  const [shown, setShown] = useState(wanted);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const [gliding, setGliding] = useState(false);
  const place = useCallback(
    (rect: Rect, snap: boolean) => placeOnScreen(rect, element.current, snap),
    [],
  );

  // Re-place when anything opens or closes or the screen resizes, returning to the user's position
  // once there is room. At most once per frame.
  useEffect(() => {
    let frame = 0;
    const settle = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (moving.current !== null || sizing.current !== null) return;
        const next = place(wanted, false);
        const now = shownRef.current;
        if (
          Math.abs(now.x - next.x) <= 0.5 &&
          Math.abs(now.y - next.y) <= 0.5 &&
          now.width === next.width &&
          now.height === next.height
        )
          return;
        setGliding(true);
        window.setTimeout(() => setGliding(false), 200);
        setShown(next);
      });
    };
    settle();
    const changes = new MutationObserver(settle);
    changes.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', settle);
    return () => {
      cancelAnimationFrame(frame);
      changes.disconnect();
      window.removeEventListener('resize', settle);
    };
  }, [place, wanted]);

  const startMove = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button') !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    moving.current = { dx: event.clientX - shown.x, dy: event.clientY - shown.y };
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const at = moving.current;
    if (at === null) return;
    const next = place({ ...shown, x: event.clientX - at.dx, y: event.clientY - at.dy }, true);
    setShown(next);
    setWanted(next);
  };
  const resize = (event: ReactPointerEvent<HTMLElement>) => {
    const from = sizing.current;
    if (from === null) return;
    const next = place(
      sized(from.start, from.corner, event.clientX - from.x, event.clientY - from.y, least),
      false,
    );
    setShown(next);
    setWanted(next);
  };

  return createPortal(
    <section
      aria-label={label}
      className="wiki-window"
      data-floating-window=""
      data-gliding={gliding ? '' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      ref={element}
      style={{ left: shown.x, top: shown.y, width: shown.width, height: shown.height }}
    >
      <header
        className="wiki-window__bar"
        onPointerDown={startMove}
        onPointerMove={move}
        onPointerUp={() => {
          moving.current = null;
        }}
      >
        <span className="wiki-window__title">{title}</span>
        {actions}
        <button
          aria-label={`Close ${title}`}
          className="wiki-window__close"
          onClick={onClose}
          type="button"
        >
          <CrossIcon />
        </button>
      </header>
      <div className="wiki-window__body">{children}</div>
      {CORNERS.map((corner) => (
        <span
          aria-hidden="true"
          className="wiki-window__size"
          data-corner={corner}
          key={corner}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            sizing.current = { x: event.clientX, y: event.clientY, start: shown, corner };
          }}
          onPointerMove={resize}
          onPointerUp={() => {
            sizing.current = null;
            const next = place(shown, false);
            setShown(next);
            setWanted(next);
          }}
        />
      ))}
    </section>,
    document.body,
  );
}
