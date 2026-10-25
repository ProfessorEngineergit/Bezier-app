/**
 * Whether the middle of the title bar is free for Nib. The island floats over the bar from its own
 * root and cannot take part in its layout, so it measures the bar and steps aside when something
 * (a long project name, the workspace switcher) is there. The name takes priority.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Clearance kept around the circle so it does not touch the name. */
const MARGIN = 10;

export function islandSlot(viewportWidth: number, barHeight: number, circle = 32): Rect {
  const left = viewportWidth / 2 - circle / 2;
  const top = (barHeight - circle) / 2;
  return { left, top, right: left + circle, bottom: top + circle };
}

export function overlaps(slot: Rect, others: readonly Rect[], margin = MARGIN): boolean {
  return others.some(
    (r) =>
      r.right > r.left &&
      r.bottom > r.top &&
      r.left < slot.right + margin &&
      r.right > slot.left - margin &&
      r.top < slot.bottom &&
      r.bottom > slot.top,
  );
}

/** Elements on the bars with content (text and controls), not the empty space between them. */
const ON_THE_BAR = [
  '.titlebar :is(button, input, canvas, .titlebar__name, .titlebar__badge)',
  '.library__bar :is(button, input, .library__crumb, .library__sep)',
].join(', ');

/**
 * Full-window screens with no bar to sit in: the film and the loading screen. Not the project
 * loading screen, which leaves the bar free so Nib's line can show progress.
 */
const IN_FRONT = '.film, #boot:not([hidden]):not([data-below-bar])';

export function barIsCovered(doc: Document = document): boolean {
  if (doc.querySelector(IN_FRONT) !== null) return true;
  // No bar at all also counts as covered. A crash shows regardless.
  if (doc.querySelector('.titlebar, .library__bar') === null) return true;
  const view = doc.defaultView;
  if (view === null) return true;
  const bar = Number.parseFloat(
    getComputedStyle(doc.documentElement).getPropertyValue('--bar-height'),
  );
  const slot = islandSlot(view.innerWidth, Number.isFinite(bar) ? bar : 52);
  const rects: Rect[] = [];
  for (const element of doc.querySelectorAll(ON_THE_BAR))
    rects.push(element.getBoundingClientRect());
  return overlaps(slot, rects);
}
