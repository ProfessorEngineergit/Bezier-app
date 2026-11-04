import { describe, expect, it } from 'vitest';
import { largestFit } from './largest-fit.js';

const upTo = (limit: number) => (size: number) => Promise.resolve(size <= limit);

describe('the largest size that fits', () => {
  it('finds a number worth reading, just under the limit', async () => {
    expect(await largestFit(30, upTo(12.47))).toBe(12.4);
    expect(await largestFit(5, upTo(0.37))).toBe(0.36);
  });

  it('says so when no size fits, as on a smooth edge', async () => {
    expect(await largestFit(10, upTo(0))).toBeNull();
  });

  it('only offers what was tried and fitted', async () => {
    const tried: number[] = [];
    const size = await largestFit(30, async (value) => {
      tried.push(value);
      return value <= 8;
    });
    expect(tried).toContain(size);
  });
});
