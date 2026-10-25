import { describe, expect, it } from 'vitest';
import { overThePole } from './tumble.js';

describe('going over a pole', () => {
  it('is an ordinary move away from the poles', () => {
    expect(overThePole(1, 0.3)).toEqual({ phi: 1.3, flipped: false });
    expect(overThePole(1, -0.3).flipped).toBe(false);
  });

  it('comes out the far side of the top, as far past it as the move went', () => {
    const over = overThePole(0.1, -0.35);
    expect(over.flipped).toBe(true);
    expect(over.phi).toBeCloseTo(0.25);
  });

  it('comes out the far side of the bottom the same way', () => {
    const over = overThePole(Math.PI - 0.1, 0.35);
    expect(over.flipped).toBe(true);
    expect(over.phi).toBeCloseTo(Math.PI - 0.25);
  });

  it('keeps going round: a long drag over the top lands back on the right side of a pole', () => {
    let phi = 1;
    let flips = 0;
    for (let step = 0; step < 40; step += 1) {
      const over = overThePole(phi, -0.2);
      phi = over.phi;
      if (over.flipped) flips += 1;
      expect(phi).toBeGreaterThanOrEqual(0);
      expect(phi).toBeLessThanOrEqual(Math.PI);
    }
    expect(flips).toBeGreaterThan(0);
  });
});
