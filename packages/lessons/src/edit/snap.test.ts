import { describe, expect, it } from 'vitest';
import { snapTime } from './snap.js';

describe('snapping on the timeline', () => {
  it('pulls a moment onto a target within a few pixels, at any zoom', () => {
    // 10 px per second: 8 px is 0.8 s.
    expect(snapTime(4.5, [5], 10)).toBe(5);
    expect(snapTime(4.1, [5], 10)).toBe(4.1);
    // 400 px per second: 8 px is 0.02 s.
    expect(snapTime(4.99, [5], 400)).toBe(5);
    expect(snapTime(4.9, [5], 400)).toBe(4.9);
  });

  it('takes the nearest of several', () => {
    expect(snapTime(4.4, [4, 5, 4.6], 10)).toBe(4.6);
  });

  it('leaves a moment alone with nothing to snap to', () => {
    expect(snapTime(3.3, [], 100)).toBe(3.3);
  });
});
