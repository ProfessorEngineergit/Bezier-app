import { expect, it } from 'vitest';
import {
  angleDelta,
  axisDistance,
  planeDistance,
  rotationStep,
  smoothSpeed,
} from './move-gizmo-math.js';

it.each([0.2, 2, 20])('recovers world distance at %s pixels/mm with perspective depth', (scale) => {
  const a = { x: scale, y: -scale * 0.4, depth: 0.004 };
  for (const distance of [-35, 12, 70]) {
    const denominator = 1 + distance * a.depth;
    expect(
      axisDistance(a, (a.x * distance) / denominator, (a.y * distance) / denominator),
    ).toBeCloseTo(distance, 8);
  }
});
it('inverts a skewed perspective plane in both directions', () => {
  const a = { x: 4, y: -2, depth: 0.006 };
  const b = { x: 2, y: 3, depth: -0.003 };
  const u = -12,
    v = 25,
    denominator = 1 + u * a.depth + v * b.depth;
  const result = planeDistance(
    a,
    b,
    (a.x * u + b.x * v) / denominator,
    (a.y * u + b.y * v) / denominator,
  );
  expect(result.a).toBeCloseTo(u, 8);
  expect(result.b).toBeCloseTo(v, 8);
});
it('crosses the rotation seam without jumping by a full turn', () => {
  expect(angleDelta((179 * Math.PI) / 180, (-179 * Math.PI) / 180)).toBeCloseTo(
    (2 * Math.PI) / 180,
  );
});
it('does not amplify degenerate projections', () => {
  expect(axisDistance({ x: 0, y: 0, depth: 0 }, 50, 30)).toBe(0);
  expect(planeDistance({ x: 2, y: 0, depth: 0 }, { x: 4, y: 0, depth: 0 }, 10, 5)).toEqual({
    a: 0,
    b: 0,
  });
});
it('turns in finer steps the slower the pointer goes, and Shift is always the coarse one', () => {
  expect(rotationStep(5, false)).toBe(1);
  expect(rotationStep(60, false)).toBe(5);
  expect(rotationStep(400, false)).toBe(15);
  expect(rotationStep(5, true)).toBe(15);
});
it('moves the speed only part of the way to what one event says', () => {
  // 0.5 degrees in 8 ms is 62.5 a second; a fifth of the way after one event from a standstill.
  expect(smoothSpeed(0, 0.5, 0.008)).toBeCloseTo(25, 5);
  expect(smoothSpeed(0, 0, 0.016)).toBe(0);
});
