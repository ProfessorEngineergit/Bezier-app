import { describe, expect, it } from 'vitest';
import { MOUTH_VERTEX_COUNT, writeMouth } from './mouth.js';

function mouth(smile: number, width = 1, thick = 1): Float32Array {
  const out = new Float32Array(MOUTH_VERTEX_COUNT * 3);
  writeMouth(smile, width, thick, out);
  return out;
}

/** The highest and lowest y of the centre line (the ring's first point of each section). */
function span(points: Float32Array): { left: number; middle: number } {
  const ring = 6;
  const at = (section: number) => points[section * ring * 3 + 1] ?? Number.NaN;
  return { left: at(0), middle: at(12) };
}

describe('the mouth', () => {
  it('has every vertex finite, whatever it is asked', () => {
    for (const [s, w, t] of [
      [1, 1, 1],
      [-1, 1, 1],
      [0, 0.45, 1.7],
      [1.5, 1.2, 1],
    ] as const)
      expect(mouth(s, w, t).every(Number.isFinite)).toBe(true);
  });

  it('curls its corners up when it smiles and down when it frowns', () => {
    const smiling = span(mouth(1.5));
    const frowning = span(mouth(-1));
    expect(smiling.left).toBeGreaterThan(smiling.middle);
    expect(frowning.left).toBeLessThan(frowning.middle);
  });

  it('gets wider when asked to and stays narrow as a round "oh"', () => {
    const reach = (points: Float32Array) =>
      Math.max(...points.filter((_, i) => i % 3 === 0).map(Math.abs));
    expect(reach(mouth(1, 1.2))).toBeGreaterThan(reach(mouth(1, 0.45)));
  });

  it('gets thicker with the thickness', () => {
    const depth = (points: Float32Array) =>
      Math.max(...points.filter((_, i) => i % 3 === 2).map(Math.abs));
    expect(depth(mouth(1, 1, 1.7))).toBeGreaterThan(depth(mouth(1, 1, 1)));
  });

  it('narrows to a tip at both ends', () => {
    const points = mouth(1);
    const ring = 6;
    const radius = (section: number) =>
      Math.hypot(points[section * ring * 3 + 2] ?? 0, points[section * ring * 3 + 5] ?? 0);
    expect(radius(0)).toBeLessThan(radius(12));
  });
});
