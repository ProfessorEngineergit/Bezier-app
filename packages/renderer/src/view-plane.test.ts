import { leanedBasis, planeBasis } from '@bezier/core';
import { describe, expect, it } from 'vitest';
import { planeBetween, planeSpun } from './view-plane.js';

const normalOf = (sides: Parameters<typeof planeBetween>[0]) => {
  const { plane, lean } = planeBetween(sides);
  const rest = planeBasis(plane);
  if (rest === null) throw new Error('no plane');
  return leanedBasis(rest, lean).normal;
};

describe('the sketch plane taken from the view', () => {
  it('is the side plane itself, unleaned, for a square view', () => {
    expect(planeBetween(['top'])).toEqual({ plane: 'XY', lean: { offset: 0, tilt: 0, turn: 0 } });
    expect(planeBetween(['front']).plane).toBe('XZ');
    expect(planeBetween(['right']).plane).toBe('YZ');
  });

  it('leans 45° to face the view between top and front, not flat on XY', () => {
    const n = normalOf(['top', 'front']);
    expect(n.x).toBeCloseTo(0, 9);
    expect(n.y).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(n.z).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it('faces a corner of the cube', () => {
    const n = normalOf(['top', 'front', 'right']);
    for (const value of [n.x, -n.y, n.z]) expect(value).toBeCloseTo(1 / Math.sqrt(3), 3);
  });

  it('lets a leaning plane go when the view is spun, and turns a square side one', () => {
    expect(planeSpun(planeBetween(['top', 'front']))).toBeNull();
    expect(planeSpun(planeBetween(['front']))?.plane).toBe('YZ');
    expect(planeSpun(planeBetween(['top']))?.plane).toBe('XY');
  });
});
