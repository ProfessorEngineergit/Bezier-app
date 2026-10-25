import { expect, it } from 'vitest';
import { settleOverlaps } from './drawing-overlap.js';

it('drops a hidden edge that lies under a visible one, in either direction', () => {
  // The back bottom edge of a block seen from the front lies exactly under the front one.
  const { hidden } = settleOverlaps([[0, 0, 60, 0]], [[60, 0, 0, 0]]);
  expect(hidden).toEqual([]);
});

it('keeps the part of a hidden edge that no visible line covers', () => {
  const { hidden } = settleOverlaps(
    [[0, 0, 40, 0]],
    [
      [20, 5, 20, -5],
      [30, 0, 60, 0],
    ],
  );
  // The vertical one crosses the visible line and stays whole; the horizontal one keeps 40 to 60.
  const round = (line: number[] | undefined) => line?.map((v) => Math.round(v * 1000) / 1000 + 0);
  expect(hidden.map(round)).toContainEqual([20, -5, 20, 5]);
  expect(hidden.map(round)).toContainEqual([40, 0, 60, 0]);
  expect(hidden).toHaveLength(2);
});

it('merges collinear hidden pieces into one line, so two dash patterns never overlap', () => {
  // A floor edge reported whole and again in two pieces where a boss stands on it.
  const { hidden } = settleOverlaps(
    [],
    [
      [54, 74.6, 72, 74.6],
      [54, 74.6, 56, 74.6],
      [70, 74.6, 72, 74.6],
    ],
  );
  expect(hidden).toHaveLength(1);
  expect(hidden[0]?.map((v) => Math.round(v * 1000) / 1000)).toEqual([54, 74.6, 72, 74.6]);
});

it('keeps parallel hidden lines that are apart on paper', () => {
  const { hidden } = settleOverlaps(
    [],
    [
      [0, 0, 10, 0],
      [0, 0.5, 10, 0.5],
    ],
  );
  expect(hidden).toHaveLength(2);
});

it('drops a curved hidden line only when all of it lies on a visible line', () => {
  const arc = (r: number) => {
    const points: number[] = [];
    for (let i = 0; i <= 16; i++)
      points.push(r * Math.cos((Math.PI * i) / 16), r * Math.sin((Math.PI * i) / 16));
    return points;
  };
  expect(settleOverlaps([arc(10)], [arc(10)]).hidden).toEqual([]);
  expect(settleOverlaps([arc(10)], [arc(8)]).hidden).toHaveLength(1);
});
