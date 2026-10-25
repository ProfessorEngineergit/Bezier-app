import type { Sketch } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { snapCandidate } from './sketch-tools.js';

/** A 20 mm line along u from (10, 0) and a circle of 5 round (0, 20). */
const drawing: Sketch = {
  primitives: [
    { kind: 'point', id: 'a', x: 10, y: 0 },
    { kind: 'point', id: 'b', x: 30, y: 0 },
    { kind: 'line', id: 'l', start: 'a', end: 'b' },
    { kind: 'point', id: 'c', x: 0, y: 20 },
    { kind: 'circle', id: 'k', center: 'c', radius: 5 },
  ],
  constraints: [],
};

describe('snapCandidate (audit F-050)', () => {
  it('names what a point falls on, nearest kind first', () => {
    const at = (u: number, v: number) => snapCandidate(drawing, { u, v }, 1, 5);
    expect(at(10.4, 0.3)).toEqual({ at: { u: 10, v: 0 }, kind: 'endpoint' });
    expect(at(0.2, 20.3)).toEqual({ at: { u: 0, v: 20 }, kind: 'centre' });
    expect(at(0.5, -0.5)).toEqual({ at: { u: 0, v: 0 }, kind: 'origin' });
    expect(at(19.6, 0.4)).toEqual({ at: { u: 20, v: 0 }, kind: 'midpoint' });
    expect(at(5.3, 19.8)).toEqual({ at: { u: 5, v: 20 }, kind: 'quadrant' });
    expect(at(41, 12)).toEqual({ at: { u: 40, v: 10 }, kind: 'grid' });
    expect(snapCandidate(drawing, { u: 41, v: 12 }, 1, null).kind).toBeNull();
  });
});
