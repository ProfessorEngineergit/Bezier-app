import { type ConstraintSolver, createSolver, type Sketch } from '@bezier/solver';
import { beforeAll, expect, it } from 'vitest';
import { dragSketch, gripAt } from './sketch-drag.js';
import { emptySketch, positionOf, rectangleAt } from './sketch-tools.js';

let solver: ConstraintSolver;
beforeAll(async () => {
  solver = await createSolver();
});

/** Two lines joined at b, a 10 mm dimension on the first. */
const corner = (): Sketch => ({
  primitives: [
    { kind: 'point', id: 'a', x: 0, y: 0 },
    { kind: 'point', id: 'b', x: 10, y: 0 },
    { kind: 'point', id: 'c', x: 10, y: 10 },
    { kind: 'line', id: 'ab', start: 'a', end: 'b' },
    { kind: 'line', id: 'bc', start: 'b', end: 'c' },
  ],
  constraints: [{ kind: 'distance', id: 'd', a: 'a', b: 'b', value: 10 }],
});

it('takes hold of a corner before the lines through it, and of a line along its length', () => {
  expect(gripAt(corner(), { u: 10.2, v: 0.1 }, 1)).toEqual({ target: 'b', points: ['b'] });
  expect(gripAt(corner(), { u: 5, v: 0.3 }, 1)).toEqual({ target: 'ab', points: ['a', 'b'] });
  expect(gripAt(corner(), { u: 30, v: 30 }, 1)).toBeNull();
});

it('moves a line whole, and its neighbour stretches to stay joined', () => {
  const sketch = corner();
  const grip = gripAt(sketch, { u: 5, v: 0 }, 1);
  if (grip === null) throw new Error('no grip');
  const moved = dragSketch(sketch, grip, { u: 0, v: -4 }, solver);
  if (moved === null) throw new Error('refused');
  expect(positionOf(moved, 'a')?.v).toBeCloseTo(-4, 6);
  expect(positionOf(moved, 'b')?.v).toBeCloseTo(-4, 6);
  // c was free and stays where it was; the neighbour runs from the moved b to it.
  expect(positionOf(moved, 'c')?.u).toBeCloseTo(10, 6);
  expect(positionOf(moved, 'c')?.v).toBeCloseTo(10, 6);
  // Held only for the solve.
  expect(moved.primitives.some((p) => p.kind === 'point' && p.fixed === true)).toBe(false);
});

it('keeps a dimension: pulling one end of a 10 mm line swings it and does not stretch it', () => {
  const sketch = corner();
  const moved = dragSketch(sketch, { target: 'a', points: ['a'] }, { u: 0, v: 3 }, solver);
  if (moved === null) throw new Error('refused');
  const a = positionOf(moved, 'a');
  const b = positionOf(moved, 'b');
  if (a === null || b === null) throw new Error('lost a point');
  expect(Math.hypot(b.u - a.u, b.v - a.v)).toBeCloseTo(10, 4);
  expect(a.v).toBeCloseTo(3, 6);
});

it('refuses to move a fixed or locked point, and leaves the drawing as it was', () => {
  const fixed: Sketch = {
    ...corner(),
    primitives: corner().primitives.map((p) => (p.id === 'a' ? { ...p, fixed: true } : p)),
  };
  expect(dragSketch(fixed, { target: 'a', points: ['a'] }, { u: 1, v: 1 }, solver)).toBeNull();
  const locked: Sketch = {
    ...corner(),
    constraints: [...corner().constraints, { kind: 'lock', id: 'l', point: 'c', x: 10, y: 10 }],
  };
  expect(dragSketch(locked, { target: 'c', points: ['c'] }, { u: 1, v: 1 }, solver)).toBeNull();
});

it('moves the points alone without a solver', () => {
  const moved = dragSketch(corner(), { target: 'c', points: ['c'] }, { u: 2, v: 0 }, null);
  expect(moved === null ? null : positionOf(moved, 'c')).toEqual({ u: 12, v: 10 });
});

/** A fixed origin, a point b a dimensioned 10 mm from it, and c joined to b. */
const dimensioned = (extra: Sketch['constraints'] = []): Sketch => ({
  primitives: [
    { kind: 'point', id: 'o', x: 0, y: 0, fixed: true },
    { kind: 'point', id: 'b', x: 10, y: 0 },
    { kind: 'point', id: 'c', x: 10, y: 10 },
    { kind: 'line', id: 'ob', start: 'o', end: 'b' },
    { kind: 'line', id: 'bc', start: 'b', end: 'c' },
  ],
  constraints: [{ kind: 'distance', id: 'd', a: 'o', b: 'b', value: 10 }, ...extra],
});

it('slides a dimensioned point round to the nearest place the dimension allows', () => {
  const sketch = dimensioned();
  const grip = gripAt(sketch, { u: 10, v: 0 }, 1);
  if (grip === null) throw new Error('no grip');
  // The hand is 3 mm up, off the 10 mm circle: held there the drawing is infeasible, and the
  // dimensioned line must still move toward it.
  const moved = dragSketch(sketch, grip, { u: 0, v: 3 }, solver);
  if (moved === null) throw new Error('refused');
  const b = positionOf(moved, 'b');
  expect(Math.hypot(b?.u ?? 0, b?.v ?? 0)).toBeCloseTo(10, 4);
  expect(b?.v).toBeGreaterThan(2);
  // It moved toward the hand and not away from it.
  expect(Math.hypot((b?.u ?? 0) - 10, (b?.v ?? 0) - 3)).toBeLessThan(3);
});

it('still follows the hand exactly where the constraints allow it', () => {
  const sketch = dimensioned();
  const grip = gripAt(sketch, { u: 10, v: 0 }, 1);
  if (grip === null) throw new Error('no grip');
  const moved = dragSketch(sketch, grip, { u: -10, v: 10 }, solver);
  if (moved === null) throw new Error('refused');
  expect(positionOf(moved, 'b')?.u).toBeCloseTo(0, 6);
  expect(positionOf(moved, 'b')?.v).toBeCloseTo(10, 6);
});

it('keeps a drawn rectangle a rectangle when a corner is pulled (audit F-022)', () => {
  const drawn = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 20 });
  const grip = gripAt(drawn, { u: 40, v: 20 }, 1);
  if (grip === null) throw new Error('no grip');
  const pulled = dragSketch(drawn, grip, { u: 7, v: 5 }, solver);
  if (pulled === null) throw new Error('refused');
  const lines = pulled.primitives.filter((p) => p.kind === 'line');
  for (const line of lines) {
    if (line.kind !== 'line') continue;
    const a = positionOf(pulled, line.start);
    const b = positionOf(pulled, line.end);
    if (a === null || b === null) throw new Error('no ends');
    // Every side still runs along u or along v.
    expect(Math.min(Math.abs(a.u - b.u), Math.abs(a.v - b.v))).toBeLessThan(1e-6);
  }
});
