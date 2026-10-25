import { describe, expect, it } from 'vitest';
import { afterLoss } from './use-presentation-recovery.js';

describe('starting Visualize again after its device is lost', () => {
  it('starts again by itself after a loss now and then', () => {
    expect(afterLoss([], 1000).restart).toBe(true);
    expect(afterLoss([0, 120_000], 300_000)).toEqual({ losses: [300_000], restart: true });
  });

  it('stops after the fourth loss within a minute, so a lost device is not restarted forever', () => {
    let losses: number[] = [];
    const answers: boolean[] = [];
    for (const at of [0, 5000, 10_000, 15_000]) {
      const next = afterLoss(losses, at);
      losses = next.losses;
      answers.push(next.restart);
    }
    expect(answers).toEqual([true, true, true, false]);
  });
});
