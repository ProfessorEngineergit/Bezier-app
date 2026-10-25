/**
 * Relations beyond the basic set, against the real planegcs through `solve(sketch)` only, like
 * `solver.test.ts`.
 */

import { beforeAll, describe, expect, it, type TestContext } from 'vitest';
import type { ConstraintSolver, Sketch, SketchConstraint, SketchPrimitive } from './index.js';
import { createSolver } from './index.js';

let solver: ConstraintSolver | null = null;
let why = '';
beforeAll(async () => {
  try {
    solver = await createSolver();
  } catch (error) {
    why = error instanceof Error ? error.message : String(error);
  }
});

function solve(ctx: TestContext, sketch: Sketch) {
  ctx.skip(solver === null, why);
  const result = (solver as ConstraintSolver).solve(sketch);
  const at = (id: string) => {
    const p = result.positions.get(id);
    if (p === undefined) throw new Error(`no position for ${id}`);
    return p;
  };
  return { result, at };
}

const p = (id: string, x: number, y: number, fixed = false): SketchPrimitive => ({
  kind: 'point',
  id,
  x,
  y,
  ...(fixed ? { fixed } : {}),
});
const l = (id: string, start: string, end: string): SketchPrimitive => ({
  kind: 'line',
  id,
  start,
  end,
});
const sketch = (primitives: SketchPrimitive[], constraints: SketchConstraint[]): Sketch => ({
  primitives,
  constraints,
});

describe('relations', () => {
  it('puts a point on a line', (ctx) => {
    const { result, at } = solve(
      ctx,
      sketch(
        [p('a', 0, 0, true), p('b', 10, 0, true), l('l', 'a', 'b'), p('q', 4, 3)],
        [{ kind: 'pointOn', id: 'c', point: 'q', on: 'l' }],
      ),
    );
    expect(result.status).not.toBe('failed');
    expect(at('q').y).toBeCloseTo(0);
  });

  it('puts a point on a circle and on an arc', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [
          p('o', 0, 0, true),
          { kind: 'circle', id: 'k', center: 'o', radius: 5 },
          p('q', 1, 1),
          p('s', 3, 0, true),
          p('e', 0, 3, true),
          { kind: 'arc', id: 'r', center: 'o', start: 's', end: 'e' },
          p('w', 1, 2),
        ],
        [
          { kind: 'radius', id: 'rad', circle: 'k', value: 5 },
          { kind: 'pointOn', id: 'c1', point: 'q', on: 'k' },
          { kind: 'pointOn', id: 'c2', point: 'w', on: 'r' },
        ],
      ),
    );
    expect(Math.hypot(at('q').x, at('q').y)).toBeCloseTo(5);
    expect(Math.hypot(at('w').x, at('w').y)).toBeCloseTo(3);
  });

  it('puts a point at the middle of a line', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [p('a', 0, 0, true), p('b', 10, 4, true), l('l', 'a', 'b'), p('m', 2, 7)],
        [{ kind: 'midpoint', id: 'c', point: 'm', line: 'l' }],
      ),
    );
    expect(at('m').x).toBeCloseTo(5);
    expect(at('m').y).toBeCloseTo(2);
  });

  it('mirrors two points about a line, and about a point', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [
          p('a', 0, -5, true),
          p('b', 0, 5, true),
          l('axis', 'a', 'b'),
          p('u', -3, 1, true),
          p('v', 2, 2),
          p('o', 10, 10, true),
          p('s', 12, 11, true),
          p('t', 7, 7),
        ],
        [
          { kind: 'symmetric', id: 'c1', a: 'u', b: 'v', about: 'axis' },
          { kind: 'symmetric', id: 'c2', a: 's', b: 't', about: 'o' },
        ],
      ),
    );
    expect(at('v').x).toBeCloseTo(3);
    expect(at('v').y).toBeCloseTo(1);
    expect(at('t').x).toBeCloseTo(8);
    expect(at('t').y).toBeCloseTo(9);
  });

  it('lays two lines on one straight', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [
          p('a', 0, 0, true),
          p('b', 10, 0, true),
          l('l1', 'a', 'b'),
          p('c', 15, 2),
          p('d', 25, 3),
          l('l2', 'c', 'd'),
        ],
        [{ kind: 'collinear', id: 'k', a: 'l1', b: 'l2' }],
      ),
    );
    expect(at('c').y).toBeCloseTo(0);
    expect(at('d').y).toBeCloseTo(0);
  });

  it('holds a horizontal and a vertical distance, signed from a to b', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [p('a', 0, 0, true), p('b', 3, 3)],
        [
          { kind: 'horizontalDistance', id: 'h', a: 'a', b: 'b', value: 12 },
          { kind: 'verticalDistance', id: 'v', a: 'a', b: 'b', value: -4 },
        ],
      ),
    );
    expect(at('b').x).toBeCloseTo(12);
    expect(at('b').y).toBeCloseTo(-4);
  });

  it('sizes a circle by its diameter', (ctx) => {
    const { result } = solve(
      ctx,
      sketch(
        [p('o', 0, 0, true), { kind: 'circle', id: 'k', center: 'o', radius: 3 }],
        [{ kind: 'diameter', id: 'd', circle: 'k', value: 20 }],
      ),
    );
    expect(result.radii.get('k')).toBeCloseTo(10);
  });

  it('holds a point at a distance from a line', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [p('a', 0, 0, true), p('b', 10, 0, true), l('l', 'a', 'b'), p('q', 5, 1, false)],
        [
          { kind: 'pointLineDistance', id: 'd', point: 'q', line: 'l', value: 7 },
          { kind: 'horizontalDistance', id: 'h', a: 'a', b: 'q', value: 5 },
        ],
      ),
    );
    expect(Math.abs(at('q').y)).toBeCloseTo(7);
  });

  it('keeps a reference dimension out of the solve: it neither drives nor conflicts', (ctx) => {
    const { result, at } = solve(
      ctx,
      sketch(
        [p('a', 0, 0, true), p('b', 10, 0, true)],
        [{ kind: 'distance', id: 'r', a: 'a', b: 'b', value: 99, reference: true }],
      ),
    );
    expect(result.status).not.toBe('conflicting');
    expect(at('b').x).toBeCloseTo(10);
  });

  it('levels two points, and stands one above another', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [p('a', 0, 0, true), p('b', 6, 2), p('c', 3, 5)],
        [
          { kind: 'horizontalPoints', id: 'h', a: 'a', b: 'b' },
          { kind: 'verticalPoints', id: 'v', a: 'a', b: 'c' },
        ],
      ),
    );
    expect(at('b').y).toBeCloseTo(0);
    expect(at('c').x).toBeCloseTo(0);
  });

  it('holds one angle equal to another, whatever it comes to', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [
          p('o', 0, 0, true),
          p('x', 10, 0, true),
          p('u', 10, 10, true),
          l('base', 'o', 'x'),
          l('first', 'o', 'u'),
          p('o2', 20, 0, true),
          p('x2', 30, 0, true),
          p('w', 25, 3),
          l('base2', 'o2', 'x2'),
          l('second', 'o2', 'w'),
          p('w0', 25, 3),
        ],
        [
          { kind: 'equalAngle', id: 'e', a: 'base', b: 'first', c: 'base2', d: 'second' },
          { kind: 'distance', id: 'len', a: 'o2', b: 'w', value: Math.SQRT2 * 5 },
        ],
      ),
    );
    // 45°, as the first pair stands.
    expect(at('w').x - 20).toBeCloseTo(at('w').y);
  });

  it('keeps one line a set multiple of another as long', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [
          p('a', 0, 0, true),
          p('b', 10, 0, true),
          l('one', 'a', 'b'),
          p('c', 0, 5, true),
          p('d', 7, 5),
          l('two', 'c', 'd'),
        ],
        [
          { kind: 'lengthRatio', id: 'r', a: 'one', b: 'two', ratio: 2 },
          { kind: 'horizontalPoints', id: 'h', a: 'c', b: 'd' },
        ],
      ),
    );
    expect(at('d').x).toBeCloseTo(20);
  });

  it('follows line a when it changes, below one as well as above', (ctx) => {
    const { at } = solve(
      ctx,
      sketch(
        [
          p('a', 0, 0, true),
          p('b', 3, 0),
          l('one', 'a', 'b'),
          p('c', 0, 5, true),
          p('d', 9, 5),
          l('two', 'c', 'd'),
        ],
        [
          { kind: 'horizontalPoints', id: 'h1', a: 'a', b: 'b' },
          { kind: 'distance', id: 'len', a: 'a', b: 'b', value: 8 },
          { kind: 'lengthRatio', id: 'r', a: 'one', b: 'two', ratio: 0.5 },
          { kind: 'horizontalPoints', id: 'h2', a: 'c', b: 'd' },
        ],
      ),
    );
    expect(at('d').x).toBeCloseTo(4);
  });

  it('names what the constraints hold entirely, and only that', (ctx) => {
    ctx.skip(solver === null, why);
    const active = solver as ConstraintSolver;
    const held = active.determined?.(
      sketch(
        [
          p('a', 0, 0, true),
          p('b', 10, 0),
          l('fixedLength', 'a', 'b'),
          p('c', 0, 5),
          l('loose', 'a', 'c'),
          p('o', 20, 0, true),
          { kind: 'circle', id: 'sized', center: 'o', radius: 3 },
          { kind: 'circle', id: 'unsized', center: 'o', radius: 5 },
        ],
        [
          { kind: 'horizontal', id: 'h', line: 'fixedLength' },
          { kind: 'distance', id: 'd', a: 'a', b: 'b', value: 10 },
          { kind: 'radius', id: 'r', circle: 'sized', value: 3 },
        ],
      ),
    );
    expect([...(held ?? [])].sort()).toEqual(['a', 'b', 'fixedLength', 'o', 'sized'].sort());
  });
});
