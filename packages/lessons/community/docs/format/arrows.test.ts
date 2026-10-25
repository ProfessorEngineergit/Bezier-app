import { describe, expect, it } from 'vitest';
import { hitTest, isLongEnough, moveEnd, shift } from './arrows.js';

const size = { width: 1000, height: 500 };
const arrow = { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.1 };
const arrows = [arrow];

describe('arrows on a picture', () => {
  it('tells an end from the line from nothing, in pixels and not in fractions', () => {
    expect(hitTest(arrows, { x: 0.5, y: 0.1 }, size)).toEqual({ kind: 'head', index: 0 });
    expect(hitTest(arrows, { x: 0.1, y: 0.1 }, size)).toEqual({ kind: 'tail', index: 0 });
    expect(hitTest(arrows, { x: 0.3, y: 0.1 }, size)).toEqual({ kind: 'line', index: 0 });
    expect(hitTest(arrows, { x: 0.3, y: 0.4 }, size)).toEqual({ kind: 'nothing' });
    // The same fraction is more pixels along the wider side.
    expect(hitTest(arrows, { x: 0.3, y: 0.1 + 8 / 500 }, size).kind).toBe('line');
    expect(hitTest(arrows, { x: 0.3 + 0.02, y: 0.1 + 0.02 }, size).kind).toBe('nothing');
  });

  it('asks the arrow drawn last first, and an end before a line', () => {
    const crossing = [
      { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 },
      { x1: 0.5, y1: 0.1, x2: 0.5, y2: 0.9 },
    ];
    expect(hitTest(crossing, { x: 0.5, y: 0.5 }, size)).toEqual({ kind: 'line', index: 1 });
    expect(hitTest(crossing, { x: 0.9, y: 0.5 }, size)).toEqual({ kind: 'head', index: 0 });
  });

  it('moves an end, and a whole arrow, without leaving the picture or changing its shape', () => {
    expect(moveEnd(arrow, 'head', { x: 1.4, y: -0.2 })).toMatchObject({ x2: 1, y2: 0 });
    const moved = shift(arrow, 0.9, 0.2);
    expect(moved.x2).toBeCloseTo(1);
    expect(moved.x2 - moved.x1).toBeCloseTo(0.4);
    expect(moved.y1).toBeCloseTo(0.3);
  });

  it('does not make an arrow of a click', () => {
    expect(isLongEnough({ x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.51 }, size)).toBe(false);
    expect(isLongEnough({ x1: 0.1, y1: 0.5, x2: 0.3, y2: 0.5 }, size)).toBe(true);
  });
});
