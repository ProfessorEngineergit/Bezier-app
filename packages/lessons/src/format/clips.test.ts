import { describe, expect, it } from 'vitest';
import { clipAt, clips, deleteClip, fillGap, gaps, splitClip, trimClip } from './clips.js';
import { keptStretches } from './timeline.js';

const whole = { duration: 10, cuts: [{ start: 0, end: 10 }] };

describe('clips', () => {
  it('are the cuts one by one, and the whole recording when there are none', () => {
    expect(clips({ duration: 10, cuts: [] })).toEqual([{ start: 0, end: 10, index: 0 }]);
    const two = {
      duration: 10,
      cuts: [
        { start: 4, end: 10 },
        { start: 0, end: 4 },
      ],
    };
    expect(clips(two).map((c) => [c.index, c.start, c.end])).toEqual([
      [0, 0, 4],
      [1, 4, 10],
    ]);
    expect(gaps(clips(two), 10)).toEqual([]);
    expect(clipAt(clips(two), 5)?.index).toBe(1);
  });

  it('split at the playhead, and play on through the seam', () => {
    const split = splitClip(whole, 4);
    expect(split.cuts).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 10 },
    ]);
    expect(keptStretches(split)).toEqual([{ start: 0, end: 10 }]);
    expect(splitClip(whole, 0.02)).toBe(whole);
    expect(splitClip(whole, 9.95)).toBe(whole);
  });

  it('can be deleted, all but the last, leaving a gap', () => {
    const one = deleteClip(splitClip(whole, 4), 0);
    expect(one.cuts).toEqual([{ start: 4, end: 10 }]);
    expect(gaps(clips(one), 10)).toEqual([{ start: 0, end: 4 }]);
    expect(deleteClip(one, 0)).toBe(one);
  });

  it('trim at either edge, no further than the neighbours', () => {
    const split = splitClip(whole, 4);
    expect(trimClip(split, 1, 'start', 6).cuts).toEqual([
      { start: 0, end: 4 },
      { start: 6, end: 10 },
    ]);
    expect(trimClip(split, 1, 'start', 2).cuts[1]).toEqual({ start: 4, end: 10 });
    expect(trimClip(split, 0, 'end', 3).cuts[0]).toEqual({ start: 0, end: 3 });
    expect(trimClip(split, 0, 'end', 0).cuts[0]?.end).toBeCloseTo(0.1);
    expect(trimClip(split, 0, 'end', 4)).toBe(split);
  });

  it('take a gap back', () => {
    const cut = trimClip(splitClip(whole, 4), 1, 'start', 6);
    const back = fillGap(cut, { start: 4, end: 6 });
    expect(back.cuts).toEqual([{ start: 0, end: 10 }]);
  });
});
