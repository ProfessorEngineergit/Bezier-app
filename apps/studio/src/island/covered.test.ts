import { describe, expect, it } from 'vitest';
import { islandSlot, overlaps } from './covered.js';

describe('the middle of the bar', () => {
  const slot = islandSlot(1200, 52);

  it('is a 32 pixel circle centred on the window and the bar', () => {
    expect(slot).toEqual({ left: 584, top: 10, right: 616, bottom: 42 });
  });

  it('is free beside a short name', () => {
    expect(overlaps(slot, [{ left: 100, top: 14, right: 260, bottom: 38 }])).toBe(false);
  });

  it('is taken by a name that runs into it, with room to spare round him', () => {
    expect(overlaps(slot, [{ left: 100, top: 14, right: 578, bottom: 38 }])).toBe(true);
    expect(overlaps(slot, [{ left: 622, top: 14, right: 700, bottom: 38 }])).toBe(true);
    expect(overlaps(slot, [{ left: 630, top: 14, right: 700, bottom: 38 }])).toBe(false);
  });

  it('ignores what has no size, and what is below the bar', () => {
    expect(overlaps(slot, [{ left: 590, top: 10, right: 590, bottom: 40 }])).toBe(false);
    expect(overlaps(slot, [{ left: 0, top: 60, right: 1200, bottom: 900 }])).toBe(false);
  });
});
