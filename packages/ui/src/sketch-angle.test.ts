import type { Sketch } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { currentAngle, shownDegrees, withAngle } from './sketch-angle.js';
import { constrain } from './sketch-constraints.js';

/** Two lines leaving the origin: one along x, one at `degrees`, drawn in the given order. */
function corner(degrees: number, reverseA = false, reverseB = false): Sketch {
  const r = (degrees * Math.PI) / 180;
  return {
    primitives: [
      { kind: 'point', id: 'o', x: 0, y: 0 },
      { kind: 'point', id: 'p', x: 10, y: 0 },
      { kind: 'point', id: 'q', x: 10 * Math.cos(r), y: 10 * Math.sin(r) },
      reverseA
        ? { kind: 'line', id: 'a', start: 'p', end: 'o' }
        : { kind: 'line', id: 'a', start: 'o', end: 'p' },
      reverseB
        ? { kind: 'line', id: 'b', start: 'q', end: 'o' }
        : { kind: 'line', id: 'b', start: 'o', end: 'q' },
    ],
    constraints: [],
  };
}

function angleOf(sketch: Sketch) {
  const result = constrain(sketch, 'angle', ['a', 'b']);
  if (!result.ok) throw new Error(result.message);
  const constraint = result.added[0];
  if (constraint?.kind !== 'angle') throw new Error('no angle');
  return { sketch: result.sketch, constraint };
}

describe('the angle between two lines', () => {
  it('reads as the corner a person sees, whichever way the lines were drawn', () => {
    for (const [ra, rb] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      const { sketch, constraint } = angleOf(corner(45, ra, rb));
      expect(shownDegrees(sketch, constraint)).toBeCloseTo(45);
    }
  });

  it('keeps what the solver would measure, directed from the first line to the second', () => {
    const sketch = corner(60, true, false);
    // a runs p→o, pointing along -x; b runs o→q at 60°. From -x to 60° is -120°.
    expect(currentAngle(sketch, 'a', 'b')).toBeCloseTo((-120 * Math.PI) / 180);
  });

  it('turns the second line to a typed angle and keeps the stored value consistent', () => {
    for (const [ra, rb] of [
      [false, false],
      [true, true],
      [true, false],
    ] as const) {
      const { sketch, constraint } = angleOf(corner(30, ra, rb));
      const changed = withAngle(sketch, constraint.id, 90);
      const stored = changed.constraints.find((c) => c.id === constraint.id);
      if (stored?.kind !== 'angle') throw new Error('lost');
      expect(shownDegrees(changed, stored)).toBeCloseTo(90);
      // The geometry now stands at what is stored, so a solver has nothing to move.
      expect(currentAngle(changed, 'a', 'b')).toBeCloseTo(stored.valueRadians);
      const q = changed.primitives.find((p) => p.id === 'q');
      expect(q?.kind === 'point' && Math.hypot(q.x, q.y)).toBeCloseTo(10);
    }
  });

  it('refuses a second angle on the same pair and a value out of range', () => {
    const { sketch, constraint } = angleOf(corner(45));
    const again = constrain(sketch, 'angle', ['b', 'a']);
    expect(again.ok).toBe(false);
    expect(withAngle(sketch, constraint.id, 180)).toBe(sketch);
    expect(withAngle(sketch, constraint.id, 0)).toBe(sketch);
  });
});
