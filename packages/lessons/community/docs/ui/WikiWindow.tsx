/**
 * Floating wiki windows (dragged by the title bar, resized from any corner) and the ⌘K search,
 * rendered at the app root. Placement follows the app's floating-panel rules via
 * `DocsHost.place`: clear of controls, snapped to them, and moved aside for anything that opens.
 */

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { CrossIcon } from '../../ui/icons.js';
import { findArticles } from '../format/search.js';
import { useDocsHost } from './context.js';
import { WikiView } from './WikiView.js';
import { type FloatRect, useWiki, WikiWindowScope } from './wiki-state.js';

const SMALLEST = { width: 340, height: 280 };
/** Minimum size while editing: room for the editor bar and a few lines. */
const EDITING = { width: 580, height: 520 };
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
type Corner = (typeof CORNERS)[number];

/** Fallback placement without `DocsHost.place`: keep the window on screen. */
function onScreen(rect: FloatRect): FloatRect {
  const width = Math.min(rect.width, window.innerWidth - 16);
  const height = Math.min(rect.height, window.innerHeight - 16);
  return {
    width,
    height,
    x: Math.min(Math.max(8, rect.x), window.innerWidth - width - 8),
    y: Math.min(Math.max(8, rect.y), window.innerHeight - height - 8),
  };
}

/** Resizes from a corner by (dx, dy), keeping the opposite corner fixed. */
function sized(start: FloatRect, corner: Corner, dx: number, dy: number): FloatRect {
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const width = Math.max(SMALLEST.width, start.width + (west ? -dx : dx));
  const height = Math.max(SMALLEST.height, start.height + (north ? -dy : dy));
  return {
    width,
    height,
    x: west ? start.x + start.width - width : start.x,
    y: north ? start.y + start.height - height : start.y,
  };
}

export function WikiWindow() {
  const wiki = useWiki();
  const host = useDocsHost();
  const element = useRef<HTMLElement>(null);
  const moving = useRef<{ dx: number; dy: number } | null>(null);
  const sizing = useRef<{ x: number; y: number; start: FloatRect; corner: Corner } | null>(null);
  const { rect } = wiki;
  /** The displayed rect: the chosen one, or moved aside for something that opened. */
  const [shown, setShown] = useState<FloatRect>(rect);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const [gliding, setGliding] = useState(false);
  const place = useCallback(
    (wanted: FloatRect, snap: boolean) =>
      host.place?.(wanted, element.current, snap) ?? onScreen(wanted),
    [host],
  );

  // Re-place on layout or window size changes, returning to the chosen rect when there is room.
  // At most once per frame.
  useEffect(() => {
    if (!wiki.floating) return;
    let frame = 0;
    const settle = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (moving.current !== null || sizing.current !== null) return;
        const next = place(rect, false);
        const now = shownRef.current;
        const moved = Math.abs(now.x - next.x) > 0.5 || Math.abs(now.y - next.y) > 0.5;
        if (!moved && now.width === next.width && now.height === next.height) return;
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
  }, [place, rect, wiki.floating]);

  // When editing starts, grow to `EDITING` so the editor bar (Close, status, Show Markdown, Done)
  // fits in one row. Only at that moment; afterwards the user's size is kept.
  const editing = wiki.view.kind === 'edit';
  const wasEditing = useRef(false);
  useEffect(() => {
    const started = editing && !wasEditing.current;
    wasEditing.current = editing;
    if (!wiki.floating || !started) return;
    if (rect.width >= EDITING.width && rect.height >= EDITING.height) return;
    const wanted = {
      ...rect,
      width: Math.max(rect.width, EDITING.width),
      height: Math.max(rect.height, EDITING.height),
    };
    const next = place(wanted, false);
    setShown(next);
    wiki.setRect(next);
  }, [editing, wiki.floating, rect, place, wiki.setRect]);

  if (!wiki.floating) return null;

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
    wiki.setRect(next);
  };
  const resize = (event: ReactPointerEvent<HTMLElement>) => {
    const from = sizing.current;
    if (from === null) return;
    const next = onScreen(
      sized(from.start, from.corner, event.clientX - from.x, event.clientY - from.y),
    );
    setShown(next);
    wiki.setRect(next);
  };

  return createPortal(
    <section
      aria-label="Wiki"
      className="wiki-window"
      data-gliding={gliding ? '' : undefined}
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
        <span className="wiki-window__title">Wiki</span>
        <button className="wiki-text-button" onClick={() => wiki.setSearching(true)} type="button">
          Search <kbd>⌘K</kbd>
        </button>
        {wiki.expand !== null && (
          <button className="wiki-text-button" onClick={wiki.expand} type="button">
            Expand
          </button>
        )}
        <button
          aria-label="Close the wiki"
          className="wiki-window__close"
          onClick={wiki.close}
          type="button"
        >
          <CrossIcon />
        </button>
      </header>
      <div className="wiki-window__body">
        <WikiView place="floating" />
      </div>
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
            wiki.setRect(next);
          }}
        />
      ))}
    </section>,
    document.body,
  );
}

export function WikiSearch() {
  const wiki = useWiki();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const terms = useMemo(() => query.trim().split(/\s+/).filter(Boolean), [query]);
  const found = useMemo(
    () => (terms.length === 0 ? wiki.articles : findArticles(terms, wiki.articles)).slice(0, 9),
    [terms, wiki.articles],
  );
  useEffect(() => {
    if (!wiki.searching) return;
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => field.current?.focus());
  }, [wiki.searching]);
  if (!wiki.searching) return null;

  const choose = (id: string) => {
    wiki.setSearching(false);
    // With a window already open, open another beside it.
    if (wiki.floating) wiki.openWindow(id);
    else wiki.open(id);
  };
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop that closes on an outside click
    <div
      className="wiki-search-scrim"
      onMouseDown={() => wiki.setSearching(false)}
      role="presentation"
    >
      <div
        aria-label="Search the wiki"
        aria-modal="true"
        className="wiki-palette"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <input
          aria-label="Search the wiki"
          className="wiki-palette__field"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') wiki.setSearching(false);
            else if (event.key === 'ArrowDown') setActive((n) => Math.min(found.length - 1, n + 1));
            else if (event.key === 'ArrowUp') setActive((n) => Math.max(0, n - 1));
            else if (event.key === 'Enter') {
              const chosen = found[active];
              if (chosen !== undefined) choose(chosen.id);
            } else return;
            event.preventDefault();
          }}
          placeholder="Search the wiki: extrude, fillet, units…"
          ref={field}
          value={query}
        />
        <div className="wiki-palette__results" role="listbox" aria-label="Articles">
          {found.map((article, index) => (
            <button
              aria-selected={index === active}
              className="wiki-palette__item"
              key={article.id}
              onClick={() => choose(article.id)}
              onMouseMove={() => setActive(index)}
              role="option"
              type="button"
            >
              <span>{article.title}</span>
              <small>{article.area}</small>
            </button>
          ))}
          {found.length === 0 && <p className="wiki-none">Nothing matches.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The floating windows and ⌘K search, mounted once at the app root. */
export function WikiOverlays() {
  const wiki = useWiki();
  return (
    <>
      <WikiWindow />
      {wiki.windows.map((state) => (
        <WikiWindowScope key={state.id} state={state}>
          <WikiWindow />
        </WikiWindowScope>
      ))}
      <WikiSearch />
    </>
  );
}
