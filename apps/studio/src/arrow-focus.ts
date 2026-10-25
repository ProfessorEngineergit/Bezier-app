/** Arrow-key navigation on the start page: lists (sidebar, settings sections) and the card grid. */

export interface Spot {
  x: number;
  y: number;
}

export type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export function isArrow(key: string): key is Arrow {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

/** The next entry of a list, or the same one at either end (no wrap-around). */
export function nextInList(count: number, current: number, key: string): number {
  if (count === 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return Math.min(count - 1, current + 1);
  if (key === 'ArrowUp') return current < 0 ? count - 1 : Math.max(0, current - 1);
  return current;
}

/**
 * The nearest spot in the direction of the arrow, or -1. Measured rather than counted in columns
 * because the grid reflows with the window and the last row is often short.
 */
export function nextInGrid(spots: readonly Spot[], current: number, key: Arrow): number {
  const from = spots[current];
  if (from === undefined) return spots.length > 0 ? 0 : -1;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
  let best = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  spots.forEach((spot, index) => {
    if (index === current) return;
    const along = (horizontal ? spot.x - from.x : spot.y - from.y) * sign;
    const across = Math.abs(horizontal ? spot.y - from.y : spot.x - from.x);
    // Left/right stay in the row; up/down may land in a neighbouring column when the next row is
    // shorter.
    if (along < 1 || (horizontal && across > 1)) return;
    const cost = along + across * 4;
    if (cost < bestCost) {
      bestCost = cost;
      best = index;
    }
  });
  return best;
}

/** Arrow keys over the elements matching `selector` inside the element the handler is on. */
export function arrowThroughList(
  event: { key: string; currentTarget: HTMLElement; target: EventTarget; preventDefault(): void },
  selector: string,
  activate = false,
): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  // A text field keeps its own arrow keys.
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }
  // A menu opened from inside the list handles its own arrows.
  if (event.target instanceof Element && event.target.closest('[role="menu"]') !== null) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)];
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next = items[nextInList(items.length, current, event.key)];
  if (next === undefined) return;
  event.preventDefault();
  next.focus();
  if (activate) next.click();
}

export function arrowThroughGrid(
  event: { key: string; currentTarget: HTMLElement; target: EventTarget; preventDefault(): void },
  selector: string,
): void {
  if (!isArrow(event.key)) return;
  if (!(event.target instanceof HTMLElement) || !event.target.matches(selector)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)];
  const spots = items.map((item) => {
    const box = item.getBoundingClientRect();
    return { x: box.left, y: box.top };
  });
  const next = items[nextInGrid(spots, items.indexOf(event.target), event.key)];
  if (next === undefined) return;
  event.preventDefault();
  next.focus();
  next.scrollIntoView({ block: 'nearest' });
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The element nearest in the direction of the arrow, by on-screen position, or -1. Candidates must
 * lie beyond the current element in that direction; the best-aligned one wins and distance only
 * breaks ties.
 */
export function nextOnScreen(boxes: readonly Box[], current: number, key: Arrow): number {
  const from = boxes[current];
  if (from === undefined) return boxes.length > 0 ? 0 : -1;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
  const centre = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const here = centre(from);
  let best = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  boxes.forEach((box, index) => {
    if (index === current) return;
    const there = centre(box);
    const along = (horizontal ? there.x - here.x : there.y - here.y) * sign;
    // Overlapping elements are not "next" in that direction.
    const gap = horizontal
      ? sign > 0
        ? box.x - (from.x + from.width)
        : from.x - (box.x + box.width)
      : sign > 0
        ? box.y - (from.y + from.height)
        : from.y - (box.y + box.height);
    if (along < 1 || gap < -1) return;
    // Up/down stay in the column. Left/right need not be level: the sidebar has three rows and the
    // list beside it twenty.
    if (!horizontal && (box.x >= from.x + from.width || box.x + box.width <= from.x)) return;
    const across = Math.abs(horizontal ? there.y - here.y : there.x - here.x);
    // Alignment first, then distance.
    const cost = across * 3 + Math.max(0, gap);
    if (cost < bestCost) {
      bestCost = cost;
      best = index;
    }
  });
  return best;
}

/** Arrow-key targets: buttons and links, not their contents. */
const PLACES =
  'button:not(:disabled), a[href], [role="radio"], [role="tab"], [role="switch"], input[type="checkbox"], summary';

/** Elements that keep their own arrow keys: text, list boxes, sliders, open menus. */
const KEEPS_ARROWS =
  'input:not([type="checkbox"]), textarea, select, [contenteditable="true"], [role="menu"], [role="slider"], [role="listbox"], [role="radiogroup"]';

/**
 * Arrow keys over every focusable element on the page. A fallback after `arrowThroughList` and
 * `arrowThroughGrid`: ignores keys they already handled and keys inside fields or menus.
 */
export function arrowAcrossPage(event: {
  key: string;
  currentTarget: HTMLElement;
  target: EventTarget;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  preventDefault(): void;
}): void {
  if (event.defaultPrevented || !isArrow(event.key)) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (!(event.target instanceof HTMLElement)) return;
  if (event.target.closest(KEEPS_ARROWS) !== null) return;
  const places = [...event.currentTarget.querySelectorAll<HTMLElement>(PLACES)].filter((place) => {
    const box = place.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && place.closest('[hidden], [inert]') === null;
  });
  const here = places.indexOf(event.target.closest<HTMLElement>(PLACES) ?? event.target);
  if (here === -1) return;
  const next =
    places[
      nextOnScreen(
        places.map((place) => place.getBoundingClientRect()),
        here,
        event.key,
      )
    ];
  if (next === undefined) return;
  event.preventDefault();
  next.focus();
  next.scrollIntoView({ block: 'nearest' });
}
