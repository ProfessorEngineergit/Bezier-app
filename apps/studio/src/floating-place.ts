/**
 * Controls that floating windows keep clear of, and where they may be placed. Shared by inspection
 * panels (stage pixels) and wiki windows (window pixels) (audit D10).
 */

import { type Box, drawIn, keepClear } from './panel-place.js';

/** Controls that are always on screen, and what opens from them. */
export const OBSTACLES = [
  '.rail .rail__icons',
  '.rail__flyout',
  '.rail__popoverAnchor .popover',
  '.view-panel-dock',
  '.items-panel',
  '.sim-inspector',
  '.sim-bar',
].join(', ');

/** On the whole screen, the title bar and the start page sidebar count as well. */
const SCREEN_OBSTACLES = `${OBSTACLES}, .titlebar, .library-sidebar`;

/** Obstacles inside `within` (or the whole screen), in its pixels, excluding `self`. */
export function obstaclesIn(within: Element | null, self: Element | null): Box[] {
  const frame = within?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const scope = within ?? document;
  const boxes: Box[] = [];
  for (const element of scope.querySelectorAll(within === null ? SCREEN_OBSTACLES : OBSTACLES)) {
    if (self !== null && (self.contains(element) || element.contains(self))) continue;
    // Skip hidden workspaces and anything behind the start page.
    if (element.closest('[inert], [aria-hidden="true"], .mode-hidden') !== null) continue;
    const r = element.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    boxes.push({
      left: r.left - frame.left,
      top: r.top - frame.top,
      width: r.width,
      height: r.height,
    });
  }
  return boxes;
}

/**
 * Where a screen-level floating window may go: inside the window, clear of the app's controls, and
 * snapped to them or to an edge when `snap`.
 */
export function placeOnScreen(
  rect: { x: number; y: number; width: number; height: number },
  self: Element | null,
  snap: boolean,
): { x: number; y: number; width: number; height: number } {
  const stage = { width: window.innerWidth, height: window.innerHeight };
  const obstacles = obstaclesIn(null, self);
  let box: Box = { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
  if (snap) box = drawIn(box, stage, obstacles);
  box = keepClear(box, stage, obstacles);
  return { x: box.left, y: box.top, width: box.width, height: box.height };
}
