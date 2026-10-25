import { describe, expect, it } from 'vitest';
import { Values } from './channels.js';
import { stepSprings } from './springs.js';

function settle(seconds: number, step: number): { value: Values; velocity: Values } {
  const value = new Values();
  const velocity = new Values();
  const target = new Values();
  target.set('neckTurn', 20);
  for (let t = 0; t < seconds - 1e-9; t += step) stepSprings(value, velocity, target, step);
  return { value, velocity };
}

describe('springs', () => {
  it('reach their target and stop', () => {
    const { value } = settle(2, 1 / 60);
    expect(value.get('neckTurn')).toBeCloseTo(20, 3);
  });

  it('never overshoot', () => {
    const value = new Values();
    const velocity = new Values();
    const target = new Values();
    target.set('neckTurn', 20);
    let peak = 0;
    for (let i = 0; i < 300; i++) {
      stepSprings(value, velocity, target, 1 / 60);
      peak = Math.max(peak, value.get('neckTurn'));
    }
    expect(peak).toBeLessThanOrEqual(20 + 1e-4);
  });

  it('give the same answer for one long step and many short ones', () => {
    const one = settle(0.5, 0.5).value.get('neckTurn');
    const many = settle(0.5, 1 / 120).value.get('neckTurn');
    expect(one).toBeCloseTo(many, 3);
  });

  it('say when nothing moves any more', () => {
    const value = new Values();
    const velocity = new Values();
    const target = new Values();
    target.set('neckTurn', 5);
    let moving = 1;
    for (let i = 0; i < 600 && moving > 0; i++)
      moving = stepSprings(value, velocity, target, 1 / 60);
    expect(moving).toBe(0);
  });

  it('close the eyes faster than they swing the body', () => {
    const value = new Values();
    const velocity = new Values();
    const target = new Values();
    target.set('lidClose', 1);
    target.set('bodyRoll', 1);
    for (let i = 0; i < 6; i++) stepSprings(value, velocity, target, 1 / 60);
    expect(value.get('lidClose')).toBeGreaterThan(value.get('bodyRoll'));
  });
});
