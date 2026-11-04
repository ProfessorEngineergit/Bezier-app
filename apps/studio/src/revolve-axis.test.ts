import { describe, expect, it } from 'vitest';
import { revolveAxis } from './revolve-axis.js';

const box = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('revolveAxis', () => {
  it('takes the axis a half outline stands on', () => {
    expect(revolveAxis([box(0, -10, 20, 30)])).toBe('v');
    expect(revolveAxis([box(-20, 0, 10, 30)])).toBe('u');
  });

  it('keeps clear of an axis the outline crosses', () => {
    expect(revolveAxis([box(-5, 10, 5, 20)])).toBe('u');
    expect(revolveAxis([box(10, -5, 20, 5)])).toBe('v');
  });

  it('stays with the horizontal when nothing decides', () => {
    expect(revolveAxis([box(10, 10, 20, 20)])).toBe('u');
    expect(revolveAxis([box(-5, -5, 5, 5)])).toBe('u');
    expect(revolveAxis([])).toBe('u');
  });
});
