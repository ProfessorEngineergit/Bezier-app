import { describe, expect, it } from 'vitest';
import {
  leanedBasis,
  leanOf,
  type PlaneBasis,
  planeBasis,
  planeFacing,
  restingBasis,
} from './plane.js';

const XY = planeBasis('XY') as PlaneBasis;

const close = (a: PlaneBasis, b: PlaneBasis) => {
  for (const key of ['origin', 'normal', 'xDirection', 'yDirection'] as const)
    for (const axis of ['x', 'y', 'z'] as const) expect(a[key][axis]).toBeCloseTo(b[key][axis]);
};

describe('a leaning sketch plane', () => {
  it('stays right-handed and unit length whatever the lean', () => {
    const b = leanedBasis(XY, { offset: 3, tilt: 0.7, turn: -1.1 });
    const { xDirection: x, yDirection: y, normal: n } = b;
    expect(Math.hypot(x.x, x.y, x.z)).toBeCloseTo(1);
    expect(x.x * y.x + x.y * y.y + x.z * y.z).toBeCloseTo(0);
    // normal = x × y
    expect(x.y * y.z - x.z * y.y).toBeCloseTo(n.x);
    expect(x.z * y.x - x.x * y.z).toBeCloseTo(n.y);
    expect(x.x * y.y - x.y * y.x).toBeCloseTo(n.z);
  });

  it('comes back to what it rests on', () => {
    const lean = { offset: -12, tilt: Math.PI / 4, turn: 0.3 };
    close(restingBasis(leanedBasis(XY, lean), lean), XY);
  });

  it('reads no lean from a sketch saved before there was one', () => {
    expect(leanOf({ plane: 'XY' })).toEqual({ offset: 0, tilt: 0, turn: 0 });
  });
});

describe('planeFacing', () => {
  const close = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ) => {
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
  };
  const normalOf = (direction: { x: number; y: number; z: number }) => {
    const { plane, lean } = planeFacing(direction);
    const rest = planeBasis(plane);
    if (rest === null) throw new Error('no plane');
    return leanedBasis(rest, lean).normal;
  };

  it('is a plain origin plane for a square view', () => {
    expect(planeFacing({ x: 0, y: 0, z: 1 })).toEqual({
      plane: 'XY',
      lean: { offset: 0, tilt: 0, turn: 0 },
    });
    expect(planeFacing({ x: 0, y: -1, z: 0 }).plane).toBe('XZ');
    expect(planeFacing({ x: 1, y: 0, z: 0 }).plane).toBe('YZ');
  });

  it('faces the view between top and front, leaning 45°', () => {
    const d = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 };
    const { lean } = planeFacing(d);
    expect(Math.abs(lean.tilt) + Math.abs(lean.turn)).toBeCloseTo(Math.PI / 4, 9);
    close(normalOf(d), d);
  });

  it('faces any direction, a cube corner included', () => {
    for (const d of [
      { x: 1, y: -1, z: 1 },
      { x: -1, y: 1, z: 0.3 },
      { x: 0.2, y: 0.9, z: -0.4 },
      { x: -1, y: 0, z: 1 },
    ]) {
      const length = Math.hypot(d.x, d.y, d.z);
      close(normalOf(d), { x: d.x / length, y: d.y / length, z: d.z / length });
    }
  });
});
