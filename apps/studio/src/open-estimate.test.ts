import { describe, expect, it } from 'vitest';
import { openFraction } from './open-estimate.js';

describe('how far along an open is', () => {
  it('follows the clock for most of the way', () => {
    expect(openFraction(2000, 8000)).toBeCloseTo(0.25);
    expect(openFraction(6000, 8000)).toBeCloseTo(0.75);
  });

  it('never says done, however much longer it takes than last time', () => {
    expect(openFraction(8000, 8000)).toBeLessThan(0.97);
    expect(openFraction(80000, 8000)).toBeLessThanOrEqual(0.97);
    expect(openFraction(80000, 8000)).toBeGreaterThan(openFraction(8000, 8000));
  });

  it('never goes backwards', () => {
    let last = 0;
    for (let elapsed = 0; elapsed <= 30000; elapsed += 250) {
      const now = openFraction(elapsed, 8000);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it('shows nothing without a measure to go by', () => {
    expect(openFraction(1000, 0)).toBe(0);
  });
});
