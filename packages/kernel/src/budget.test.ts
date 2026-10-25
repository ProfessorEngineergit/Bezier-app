import { describe, expect, it } from 'vitest';
import { importBudgetMs } from './budget.js';

describe('the STEP import budget', () => {
  it('covers the measured large file with room to spare', () => {
    // 97 MB took 87 s on a fast machine; the budget must not cut that off.
    expect(importBudgetMs(97_300_000)).toBeGreaterThan(10 * 87_000);
  });

  it('keeps a floor for small files and a ceiling for absurd ones', () => {
    expect(importBudgetMs(1_000)).toBeGreaterThanOrEqual(30_000);
    expect(importBudgetMs(5_000_000_000)).toBe(60 * 60_000);
  });
});
