import { describe, expect, it } from 'vitest';
import { gapAt, headOf, playMove, rollbackAt } from './history-playback.js';

describe('the history playhead', () => {
  it('reads the whole model as the end', () => {
    expect(headOf(null, 4)).toBe(4);
    expect(headOf(2, 4)).toBe(2);
  });

  it('survives steps removed behind the marker', () => {
    expect(headOf(6, 4)).toBe(4);
  });

  it('writes the end as the whole model, and stays in range', () => {
    expect(rollbackAt(4, 4)).toBeNull();
    expect(rollbackAt(9, 4)).toBeNull();
    expect(rollbackAt(0, 4)).toBe(0);
    expect(rollbackAt(-1, 4)).toBe(0);
  });

  it('finds the gap by the middle of each row', () => {
    const rows = [
      { top: 0, bottom: 10 },
      { top: 10, bottom: 20 },
    ];
    expect(gapAt(-5, rows)).toBe(0);
    expect(gapAt(6, rows)).toBe(1);
    expect(gapAt(16, rows)).toBe(2);
  });
});

describe('playing the history', () => {
  it('waits for the rewind before the first step, instead of stopping at the old end', () => {
    expect(playMove(3, 3, true)).toBe('wait');
    expect(playMove(0, 3, true)).toBe('step');
  });

  it('steps until the whole model is back', () => {
    expect(playMove(1, 3, false)).toBe('step');
    expect(playMove(3, 3, false)).toBe('end');
  });
});
