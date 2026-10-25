import { describe, expect, it } from 'vitest';
import { boxBetween, marqueeSelection } from './card-marquee.js';

const card = (id: string, left: number, top: number) => ({
  id,
  box: { left, top, right: left + 100, bottom: top + 80 },
});
const cards = [card('a', 0, 0), card('b', 120, 0), card('c', 0, 100)];

describe('dragging a rectangle over projects', () => {
  it('works in whichever direction it is dragged', () => {
    expect(boxBetween(50, 60, 10, 20)).toEqual({ left: 10, top: 20, right: 50, bottom: 60 });
  });

  it('takes every card it touches, and only those', () => {
    const picked = marqueeSelection(boxBetween(90, 10, 130, 20), cards, new Set(), false);
    expect([...picked].sort()).toEqual(['a', 'b']);
  });

  it('replaces the selection, or adds to it with Shift or Command', () => {
    const before = new Set(['c']);
    expect([...marqueeSelection(boxBetween(0, 0, 10, 10), cards, before, false)]).toEqual(['a']);
    expect([...marqueeSelection(boxBetween(0, 0, 10, 10), cards, before, true)].sort()).toEqual([
      'a',
      'c',
    ]);
  });
});
