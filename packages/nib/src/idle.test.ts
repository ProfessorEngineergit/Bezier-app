import { describe, expect, it } from 'vitest';
import { Values } from './channels.js';
import { Idle, SLEEP_AFTER } from './idle.js';

/** A fixed sequence, so a test is the same every time. */
function sequence(...numbers: number[]): () => number {
  let i = 0;
  return () => numbers[i++ % numbers.length] ?? 0.5;
}

/** Runs the idle layer for `seconds` at 60 a second, from `start`, and calls `each` with the targets. */
function run(
  idle: Idle,
  start: number,
  seconds: number,
  each: (now: number, target: Values) => void,
): void {
  for (let i = 0; i < seconds * 60; i++) {
    const now = start + i / 60;
    const target = new Values();
    target.toRest();
    idle.update(now, 1 / 60, target);
    each(now, target);
  }
}

describe('idle', () => {
  it('breathes', () => {
    const idle = new Idle(sequence(0.5));
    let low = Infinity;
    let high = -Infinity;
    run(idle, 100, 6, (_, target) => {
      low = Math.min(low, target.get('bodyPitch'));
      high = Math.max(high, target.get('bodyPitch'));
    });
    expect(high - low).toBeGreaterThan(0.8);
  });

  it('blinks, and opens again', () => {
    const idle = new Idle(sequence(0.9));
    let closed = 0;
    let sawOpenAfter = false;
    run(idle, 100, 8, (_, target) => {
      const lid = target.get('lidClose');
      if (lid > 0.9) closed++;
      else if (closed > 0 && lid < 0.2) sawOpenAfter = true;
    });
    expect(closed).toBeGreaterThan(0);
    expect(sawOpenAfter).toBe(true);
  });

  it('blinks twice in a row when the dice say so', () => {
    const idle = new Idle(sequence(0.01)); // below 0.15: a double blink
    let blinks = 0;
    let was = false;
    run(idle, 100, 4, (_, target) => {
      const shut = target.get('lidClose') > 0.9;
      if (shut && !was) blinks++;
      was = shut;
    });
    expect(blinks).toBeGreaterThanOrEqual(2);
  });

  it('is not asleep at birth, however far the page clock has run', () => {
    const idle = new Idle(sequence(0.5));
    run(idle, 5000, 1, () => {});
    expect(idle.sleep).toBe(0);
  });

  it('falls asleep after a while without input and wakes when touched', () => {
    const idle = new Idle(sequence(0.5));
    run(idle, 100, SLEEP_AFTER + 8, () => {});
    expect(idle.sleep).toBeGreaterThan(0.9);
    expect(idle.touch(100 + SLEEP_AFTER + 8)).toBe(true);
    expect(idle.sleep).toBe(0);
  });

  it('closes the lids when asleep', () => {
    const idle = new Idle(sequence(0.5));
    run(idle, 100, SLEEP_AFTER + 8, () => {});
    const target = new Values();
    target.toRest();
    idle.update(100 + SLEEP_AFTER + 8.1, 1 / 60, target);
    expect(target.get('lidClose')).toBeGreaterThan(0.6);
  });

  it('turns toward what he is looking at', () => {
    const idle = new Idle(sequence(0.5));
    idle.look(30, 0, 100);
    let turn = 0;
    run(idle, 100, 1, (_, target) => {
      turn = target.get('neckTurn');
    });
    expect(turn).toBeGreaterThan(20);
  });

  it('keeps looking for a few seconds after the pointer stops, then glances about by himself', () => {
    const idle = new Idle(sequence(0.5));
    idle.look(30, 0, 100);
    expect(idle.gazing(102)).toBe(true);
    expect(idle.gazing(105)).toBe(false);
  });

  it('never looks further than a neck can turn', () => {
    const idle = new Idle(sequence(0.5));
    idle.look(500, 500, 100);
    let turn = 0;
    run(idle, 100, 2, (_, target) => {
      turn = Math.max(turn, target.get('neckTurn'));
    });
    expect(turn).toBeLessThan(40);
  });
});
