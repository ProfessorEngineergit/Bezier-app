import { describe, expect, it } from 'vitest';
import { FrameBudget } from './frame-budget.js';

/** Draw `frames` frames `gap` apart from `start`; returns when the last was drawn. */
function run(budget: FrameBudget, start: number, gap: number, frames: number): number {
  let now = start;
  for (let i = 0; i < frames; i++) {
    budget.drawn(now);
    now += gap;
  }
  return now - gap;
}

/** `frames` idle frames `gap` apart from `start`; returns the last. */
function idle(budget: FrameBudget, start: number, gap: number, frames: number): number {
  let now = start;
  for (let i = 0; i < frames; i++) {
    now += gap;
    budget.skipped(now);
  }
  return now;
}

describe('how hard the machine finds drawing', () => {
  it('feels no pressure at 60 frames a second, on a 60 or a 120 Hz display', () => {
    const budget = new FrameBudget();
    idle(budget, 0, 8.3, 30);
    run(budget, 1000, 16.7, 60);
    expect(budget.pressure).toBe(0);
  });

  it('feels full pressure when every other frame is missed', () => {
    const budget = new FrameBudget();
    run(budget, 0, 33.4, 60);
    expect(budget.pressure).toBeGreaterThan(0.95);
  });

  it('keeps feeling it through a long load that slows idle frames too', () => {
    const budget = new FrameBudget();
    let now = idle(budget, 0, 16.7, 30);
    // Another program has the GPU: everything, idle frames included, comes late.
    now = idle(budget, now, 40, 400);
    run(budget, now + 100, 40, 400);
    expect(budget.pressure).toBe(1);
    expect(budget.spare).toBe(false);
  });

  it('does not count the pause between two separate movements', () => {
    const budget = new FrameBudget();
    const end = run(budget, 0, 16.7, 30);
    run(budget, end + 5000, 16.7, 30);
    expect(budget.pressure).toBe(0);
  });

  it('counts a slow frame followed by one with nothing new to draw', () => {
    // Input slower than frames: every other loop run draws.
    const budget = new FrameBudget();
    let now = 0;
    for (let i = 0; i < 60; i++) {
      budget.drawn(now);
      now += 33.4;
      budget.skipped(now);
      now += 16.7;
    }
    expect(budget.pressure).toBeGreaterThan(0.95);
  });

  it('knows from idle frames whether there is time to spare', () => {
    const budget = new FrameBudget();
    const now = idle(budget, 0, 16.7, 40);
    expect(budget.spare).toBe(true);
    idle(budget, now, 60, 40);
    expect(budget.spare).toBe(false);
  });
});
