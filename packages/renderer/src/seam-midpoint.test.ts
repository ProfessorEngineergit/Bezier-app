import { describe, expect, it } from 'vitest';
import { type SeamSegment, seamMidpoint } from './seam-midpoint.js';

const segment = (a: number, b: number): SeamSegment => ({
  ax: a,
  ay: 0,
  az: 0,
  bx: b,
  by: 0,
  bz: 0,
});
describe('seam midpoint', () => {
  it('uses the whole connected edge even when the clicked segment is near its end', () => {
    const first = segment(0, 1);
    const result = seamMidpoint([segment(4, 10), first, segment(4, 1)], first);
    expect(result?.point).toEqual({ x: 5, y: 0, z: 0 });
    expect(Math.abs(result?.tangent.x ?? 0)).toBe(1);
  });
  it('does not join disconnected edges belonging to the same faces', () => {
    const first = segment(0, 10);
    expect(seamMidpoint([first, segment(100, 200)], first)?.point.x).toBe(5);
  });
  it('leaves closed loops on their local picked frame instead of inventing a midpoint', () => {
    const a = segment(0, 10);
    const b = { ax: 10, ay: 0, az: 0, bx: 0, by: 10, bz: 0 };
    const c = { ax: 0, ay: 10, az: 0, bx: 0, by: 0, bz: 0 };
    expect(seamMidpoint([a, b, c], a)).toBeNull();
  });
});
