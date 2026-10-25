import { expect, it } from 'vitest';
import { angleAt, measurement } from './measurements.js';

it('measures the distance between two points', () => {
  expect(
    measurement([
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 4, z: 0 },
    ])?.distance,
  ).toBe(5);
});

it('measures the angle at the second of three points (audit F-028)', () => {
  expect(
    angleAt([
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 5, z: 0 },
    ]),
  ).toBeCloseTo(90);
  expect(
    angleAt([
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]),
  ).toBeCloseTo(45);
  expect(
    angleAt([
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ]),
  ).toBeNull();
});
