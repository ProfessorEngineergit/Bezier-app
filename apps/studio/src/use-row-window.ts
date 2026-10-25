/**
 * List virtualisation: renders only visible rows and reserves space for the rest. The Voron lists
 * 1,715 bodies; rendering all of them cost 65 ms per drag move (14 ms for 50 rows) and 1.5 to 2 s
 * per reopen. Short lists are rendered whole.
 */

/// <reference lib="dom" />

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Lists longer than this render only visible rows. */
export const WINDOW_FROM_ROWS = 200;
/** Extra rows rendered beyond each visible edge, so scrolling never shows a gap. */
const OVERSCAN = 30;
/** Assumed row height in pixels until one is measured. */
const GUESSED_ROW_PX = 30;

export interface RowWindow {
  start: number;
  end: number;
  /** Space reserved above and below the rendered rows, in pixels. */
  before: number;
  after: number;
}

export function useRowWindow(count: number, list: RefObject<HTMLElement | null>): RowWindow {
  const windowed = count > WINDOW_FROM_ROWS;
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 2 * OVERSCAN), row: 0 });

  // Read through a ref by the listeners, which are added once per list length.
  const counted = useRef(count);
  counted.current = count;

  const measure = useCallback(() => {
    const count = counted.current;
    const element = list.current;
    if (element === null) return;
    const scroller = scrollingParent(element);
    // Height of a rendered row (not a spacer); all rows are the same height.
    const sample = element.querySelector<HTMLElement>(':scope > li:not([data-spacer])');
    const row = sample?.offsetHeight || GUESSED_ROW_PX;
    const listTop =
      element.getBoundingClientRect().top -
      (scroller?.getBoundingClientRect().top ?? 0) +
      (scroller?.scrollTop ?? window.scrollY);
    const top = (scroller?.scrollTop ?? window.scrollY) - listTop;
    const height = scroller?.clientHeight ?? window.innerHeight;
    const start = Math.max(0, Math.floor(top / row) - OVERSCAN);
    const end = Math.min(count, Math.ceil((top + height) / row) + OVERSCAN);
    setRange((old) =>
      old.start === start && old.end === end && old.row === row ? old : { start, end, row },
    );
  }, [list]);

  // Measured on render of a new length, on scroll and on resize, not every render: during a drag
  // that is every pointer move and would force a layout each time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again when the length changes
  useLayoutEffect(() => {
    if (windowed) measure();
  }, [windowed, count, measure]);

  useEffect(() => {
    if (!windowed) return;
    const element = list.current;
    if (element === null) return;
    const scroller = scrollingParent(element);
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', later, { passive: true });
    const resized = new ResizeObserver(later);
    resized.observe(scroller ?? element);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', later);
      resized.disconnect();
    };
  }, [windowed, list, measure]);

  if (!windowed) return { start: 0, end: count, before: 0, after: 0 };
  const start = Math.min(range.start, count);
  const end = Math.min(Math.max(range.end, start), count);
  const row = range.row || GUESSED_ROW_PX;
  return { start, end, before: start * row, after: (count - end) * row };
}

/** The nearest ancestor that scrolls, or null for the page itself. */
function scrollingParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return parent;
  }
  return null;
}
