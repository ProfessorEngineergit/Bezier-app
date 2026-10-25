import type { EdgeSet } from '@bezier/kernel';
import { describe, expect, it } from 'vitest';
import { thinEdges } from './outline-budget.js';

/** Straight two-point lines, each `length` long, at increasing heights. */
function lines(lengths: number[]): EdgeSet {
  const positions = new Float32Array(lengths.length * 6);
  const starts = new Uint32Array(lengths.length);
  lengths.forEach((length, i) => {
    starts[i] = i * 6;
    positions.set([0, 0, i, length, 0, i], i * 6);
  });
  return { positions, polylineStarts: starts };
}

describe('an import outline within budget', () => {
  it('is left as it is', () => {
    const edges = lines([1, 2, 3]);
    expect(thinEdges(edges, 10)).toBe(edges);
  });

  it('keeps the longest lines when over budget', () => {
    const thin = thinEdges(lines([1, 9, 5, 7]), 2);
    expect(thin.polylineStarts.length).toBe(2);
    // The two longest, 9 and 7, end at x = 9 and x = 7.
    const ends = [...thin.polylineStarts].map((s) => thin.positions[s + 3]);
    expect(ends.sort()).toEqual([7, 9]);
  });

  it('thins a long curve to a few points and keeps both ends', () => {
    const points = 200;
    const positions = new Float32Array(points * 3);
    for (let i = 0; i < points; i++) positions[i * 3] = i;
    const thin = thinEdges({ positions, polylineStarts: new Uint32Array([0]) }, 50);
    expect(thin.positions.length / 3).toBeLessThanOrEqual(12 + 1);
    expect(thin.positions[0]).toBe(0);
    expect(thin.positions[thin.positions.length - 3]).toBe(points - 1);
  });
});
