import { expect, it } from 'vitest';
import { hiddenDash } from './drawing-sheet.js';

const pattern = (points: number[]) => hiddenDash(points).split(' ').map(Number);
const coverage = (points: number[], length: number) => {
  const [dash = 0, gap = 0] = pattern(points);
  // Whole dashes with a gap between each, ending on a dash.
  const dashes = (length + gap) / (dash + gap);
  return { dash, gap, dashes };
};

it('breaks a hidden line shorter than one dash, so it never prints as a solid edge', () => {
  // The side of a 4 mm boss behind a wall at 1:2 is 2 mm on paper, less than one 2.4 mm dash.
  const { dash, gap, dashes } = coverage([0, 0, 0, 2], 2);
  expect(dash).toBeLessThan(2);
  expect(gap).toBeGreaterThan(0);
  expect(dashes).toBeCloseTo(2, 2);
});

it('starts and ends a long hidden line on a dash', () => {
  const { dash, dashes } = coverage([0, 0, 50, 0], 50);
  expect(Math.abs(dashes - Math.round(dashes))).toBeLessThan(0.01);
  expect(dash).toBeGreaterThan(2);
  expect(dash).toBeLessThan(2.8);
});

it('measures a curve along its points, not end to end', () => {
  // A half circle of radius 10 sampled finely: about 31.4 mm long, though its ends are 20 apart.
  const points: number[] = [];
  for (let i = 0; i <= 64; i++)
    points.push(10 * Math.cos((Math.PI * i) / 64), 10 * Math.sin((Math.PI * i) / 64));
  const { dashes } = coverage(points, Math.PI * 10);
  expect(Math.abs(dashes - Math.round(dashes))).toBeLessThan(0.01);
});
