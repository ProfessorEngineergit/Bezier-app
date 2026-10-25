import { describe, expect, it } from 'vitest';
import {
  type Motion,
  pose,
  relax,
  type Size,
  type Swing,
  spring,
  swing,
  track,
  transformFor,
} from './card-drag-physics.js';

describe('a carried card', () => {
  it('puts the point it was grabbed by exactly under the pointer', () => {
    const shape = pose({ vx: 0, vy: 0 }, { angle: 0, spin: 0 }, 0.5);
    expect(transformFor(300, 200, 40, 30, shape)).toBe(
      'translate3d(260.0px, 170.0px, 0) rotate(0.00deg) scale(0.5000, 0.5000)',
    );
  });

  it('picks up the speed of a steady move, and lets it go when the pointer stops', () => {
    const motion: Motion = { vx: 0, vy: 0 };
    for (let i = 0; i < 30; i++) track(motion, 10, 0, 1 / 60);
    expect(motion.vx).toBeGreaterThan(550);
    expect(motion.vx).toBeLessThan(610);
    relax(motion, 0.5);
    expect(Math.abs(motion.vx)).toBeLessThan(10);
  });

  it('ignores coalesced events that carry no time', () => {
    const motion: Motion = { vx: 0, vy: 0 };
    track(motion, 40, 0, 0);
    expect(motion.vx).toBe(0);
  });

  it('stays quiet at any speed', () => {
    const fast = pose({ vx: 40000, vy: -40000 }, { angle: 0, spin: 0 }, 0.5);
    expect(fast.sx / 0.5).toBeLessThanOrEqual(1.03 + 1e-9);
    expect(fast.sy / 0.5).toBeGreaterThanOrEqual(0.98 - 1e-9);
  });

  it('swings back when the hand speeds up, past centre when it stops, then hangs still', () => {
    const hang: Swing = { angle: 0, spin: 0 };
    for (let i = 0; i < 6; i++) swing(hang, 12000, 1 / 60);
    expect(hang.angle).toBeLessThan(0);
    for (let i = 0; i < 6; i++) swing(hang, -12000, 1 / 60);
    let widest = 0;
    for (let i = 0; i < 20; i++) {
      swing(hang, 0, 1 / 60);
      widest = Math.max(widest, hang.angle);
    }
    expect(widest).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) swing(hang, 0, 1 / 60);
    expect(Math.abs(hang.angle)).toBeLessThan(0.005);
  });

  it('never swings past 14 degrees', () => {
    const hang: Swing = { angle: 0, spin: 0 };
    for (let i = 0; i < 60; i++) swing(hang, 1e7, 1 / 60);
    expect(Math.abs(hang.angle)).toBeLessThanOrEqual((14 * Math.PI) / 180 + 1e-9);
  });

  it('pops a little past its size when picked up, and settles on it', () => {
    const size: Size = { value: 1, speed: 0 };
    let smallest = 1;
    for (let i = 0; i < 90; i++) {
      spring(size, 0.5, 1 / 60);
      smallest = Math.min(smallest, size.value);
    }
    expect(smallest).toBeLessThan(0.49);
    expect(smallest).toBeGreaterThan(0.4);
    expect(Math.abs(size.value - 0.5)).toBeLessThan(0.005);
  });
});
