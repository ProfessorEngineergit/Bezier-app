/**
 * Arrow hit testing and geometry for pictures: a press hits an arrow end (drag it), a line (move
 * the arrow) or nothing (start a new arrow). Pure pixel geometry, so it is testable.
 */

import type { Arrow } from './article.js';

export type Hit =
  | { kind: 'tail'; index: number }
  | { kind: 'head'; index: number }
  | { kind: 'line'; index: number }
  | { kind: 'nothing' };

export interface Size {
  width: number;
  height: number;
}

/** Hit distances in pixels. */
export const REACH = { end: 14, line: 9 } as const;

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** `point` and arrows are in 0 to 1 picture units; `size` is the picture in pixels. */
export function hitTest(
  arrows: readonly Arrow[],
  point: { x: number; y: number },
  size: Size,
): Hit {
  const px = (x: number, y: number) => ({ x: x * size.width, y: y * size.height });
  const at = px(point.x, point.y);
  // The last arrow is on top, so test it first; ends take precedence over lines.
  for (let index = arrows.length - 1; index >= 0; index -= 1) {
    const arrow = arrows[index];
    if (arrow === undefined) continue;
    const tail = px(arrow.x1, arrow.y1);
    const head = px(arrow.x2, arrow.y2);
    if (Math.hypot(at.x - head.x, at.y - head.y) <= REACH.end) return { kind: 'head', index };
    if (Math.hypot(at.x - tail.x, at.y - tail.y) <= REACH.end) return { kind: 'tail', index };
  }
  for (let index = arrows.length - 1; index >= 0; index -= 1) {
    const arrow = arrows[index];
    if (arrow === undefined) continue;
    if (distanceToSegment(at, px(arrow.x1, arrow.y1), px(arrow.x2, arrow.y2)) <= REACH.line)
      return { kind: 'line', index };
  }
  return { kind: 'nothing' };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Moves one end of an arrow to `to`, clamped to the picture. */
export function moveEnd(arrow: Arrow, end: 'tail' | 'head', to: { x: number; y: number }): Arrow {
  return end === 'tail'
    ? { ...arrow, x1: clamp01(to.x), y1: clamp01(to.y) }
    : { ...arrow, x2: clamp01(to.x), y2: clamp01(to.y) };
}

/** Moves an arrow by (dx, dy), clamped to the picture without changing its shape. */
export function shift(arrow: Arrow, dx: number, dy: number): Arrow {
  const lowX = Math.min(arrow.x1, arrow.x2);
  const highX = Math.max(arrow.x1, arrow.x2);
  const lowY = Math.min(arrow.y1, arrow.y2);
  const highY = Math.max(arrow.y1, arrow.y2);
  const sx = Math.min(1 - highX, Math.max(-lowX, dx));
  const sy = Math.min(1 - highY, Math.max(-lowY, dy));
  return { x1: arrow.x1 + sx, y1: arrow.y1 + sy, x2: arrow.x2 + sx, y2: arrow.y2 + sy };
}

/** Whether an arrow is at least 18 px long, so a click does not create one. */
export const isLongEnough = (arrow: Arrow, size: Size): boolean =>
  Math.hypot((arrow.x2 - arrow.x1) * size.width, (arrow.y2 - arrow.y1) * size.height) >= 18;

/**
 * The line (stopping short of the tip) and head points of an arrow, in a 0..1 square stretched
 * over a picture `ratio` times wider than tall. The head is sized so wide pictures do not flatten
 * it.
 */
export function arrowShape(arrow: Arrow, ratio: number): { line: Arrow; head: string } {
  const size = 0.028;
  const dx = (arrow.x2 - arrow.x1) * ratio;
  const dy = arrow.y2 - arrow.y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const back = (turn: number) => {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    return {
      x: arrow.x2 - ((ux * cos - uy * sin) * size) / ratio,
      y: arrow.y2 - (ux * sin + uy * cos) * size,
    };
  };
  const a = back(0.5);
  const b = back(-0.5);
  return {
    line: {
      x1: arrow.x1,
      y1: arrow.y1,
      x2: arrow.x2 - (ux * size * 0.6) / ratio,
      y2: arrow.y2 - uy * size * 0.6,
    },
    head: `${arrow.x2},${arrow.y2} ${a.x},${a.y} ${b.x},${b.y}`,
  };
}
