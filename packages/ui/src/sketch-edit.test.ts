import { type ConstraintSolver, createSolver, type Sketch } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { solveInto } from './sketch-constraints.js';
import {
  type EditResult,
  extendAt,
  mirrorSelection,
  offsetSelection,
  patternSelection,
  splitAt,
  transformSelection,
} from './sketch-edit.js';
import { connect, emptySketch, ensurePoint, positionOf } from './sketch-tools.js';

let solver: ConstraintSolver;
beforeAll(async () => {
  solver = await createSolver();
});

function line(sketch: Sketch, from: [number, number], to: [number, number]) {
  const a = ensurePoint(sketch, { u: from[0], v: from[1] });
  const b = ensurePoint(a.sketch, { u: to[0], v: to[1] });
  return { sketch: connect(b.sketch, a.id, b.id), a: a.id, b: b.id };
}

const ok = (result: EditResult): Sketch => {
  if (!result.ok) throw new Error(result.message);
  return result.sketch;
};

const lines = (sketch: Sketch) => sketch.primitives.filter((p) => p.kind === 'line');

describe('editing a drawing', () => {
  it('extends a line from its nearer free end to the line ahead of it', () => {
    const first = line(emptySketch(), [0, 0], [5, 0]);
    const wall = line(first.sketch, [12, -5], [12, 5]);
    const extended = ok(extendAt(wall.sketch, { u: 4.5, v: 0 }, 1));
    expect(positionOf(extended, first.b)).toEqual({ u: expect.closeTo(12), v: expect.closeTo(0) });
  });

  it('refuses to extend when nothing lies ahead', () => {
    const only = line(emptySketch(), [0, 0], [5, 0]);
    expect(extendAt(only.sketch, { u: 4.5, v: 0 }, 1).ok).toBe(false);
  });

  it('splits a line in two that share the new point', () => {
    const one = line(emptySketch(), [0, 0], [10, 0]);
    const split = ok(splitAt(one.sketch, { u: 4, v: 0 }, 1));
    const [left, right] = lines(split);
    if (left?.kind !== 'line' || right?.kind !== 'line') throw new Error('not two lines');
    expect(left.end).toBe(right.start);
    expect(positionOf(split, left.end)).toEqual({ u: expect.closeTo(4), v: expect.closeTo(0) });
  });

  it('offsets a corner of two lines and keeps the copy joined at the corner', () => {
    const first = line(emptySketch(), [0, 0], [10, 0]);
    const corner = ensurePoint(first.sketch, { u: 10, v: 10 });
    const both = connect(corner.sketch, first.b, corner.id);
    const ids = lines(both).map((l) => l.id);
    const offset = ok(offsetSelection(both, ids, 1));
    const copies = lines(offset).slice(2);
    expect(copies).toHaveLength(2);
    const [c1, c2] = copies;
    if (c1?.kind !== 'line' || c2?.kind !== 'line') throw new Error('no copies');
    expect(c1.end).toBe(c2.start);
    // Left of +x is up and left of +y is -x: the corner of the copy is inside, at (9, 1).
    expect(positionOf(offset, c1.end)).toEqual({ u: expect.closeTo(9), v: expect.closeTo(1) });
  });

  it('mirrors about the line picked last, held symmetric by the solver', () => {
    const axis = line(emptySketch(), [0, -10], [0, 10]);
    const shape = line(axis.sketch, [2, 1], [6, 3]);
    const shapeLine = lines(shape.sketch)[1]?.id ?? '';
    const axisLine = lines(shape.sketch)[0]?.id ?? '';
    const mirrored = ok(mirrorSelection(shape.sketch, [shapeLine, axisLine]));
    expect(lines(mirrored)).toHaveLength(3);
    expect(mirrored.constraints.filter((c) => c.kind === 'symmetric')).toHaveLength(2);
    const solved = solveInto(mirrored, solver);
    expect(solved.ok).toBe(true);
    const xs = mirrored.primitives.flatMap((p) => (p.kind === 'point' ? [p.x] : []));
    expect(xs).toEqual(expect.arrayContaining([-2, -6]));
  });

  it('repeats along a step, and around a centre', () => {
    const one = line(emptySketch(), [0, 0], [2, 0]);
    const id = lines(one.sketch)[0]?.id ?? '';
    const row = ok(
      patternSelection(one.sketch, [id], { kind: 'linear', count: 3, step: { u: 0, v: 5 } }),
    );
    expect(lines(row)).toHaveLength(3);
    const ring = ok(
      patternSelection(one.sketch, [id], {
        kind: 'polar',
        count: 4,
        center: { u: 0, v: 0 },
        angle: 2 * Math.PI,
      }),
    );
    expect(lines(ring)).toHaveLength(4);
  });

  it('moves the points of what is picked and leaves the rest', () => {
    const first = line(emptySketch(), [0, 0], [2, 0]);
    const second = line(first.sketch, [5, 5], [6, 5]);
    const id = lines(second.sketch)[0]?.id ?? '';
    const moved = ok(transformSelection(second.sketch, [id], (p) => ({ u: p.u + 1, v: p.v })));
    expect(positionOf(moved, first.a)).toEqual({ u: 1, v: 0 });
    expect(positionOf(moved, second.a)).toEqual({ u: 5, v: 5 });
  });
});

describe('a contradiction the solver would meet by shrinking a line', () => {
  it('is refused: two separate parallel lines are not also made perpendicular', () => {
    const first = line(emptySketch(), [-20, 10], [-3, 8]);
    const both = line(first.sketch, [7, -10], [24, -13]);
    const [a, b] = lines(both.sketch).map((l) => l.id);
    const parallel = solveInto(
      { ...both.sketch, constraints: [{ kind: 'parallel', id: 'p', a: a ?? '', b: b ?? '' }] },
      solver,
    );
    if (!parallel.ok) throw new Error(parallel.message);
    const perpendicular = solveInto(
      {
        ...parallel.sketch,
        constraints: [
          ...parallel.sketch.constraints,
          { kind: 'perpendicular', id: 'q', a: a ?? '', b: b ?? '' },
        ],
      },
      solver,
    );
    expect(perpendicular.ok).toBe(false);
  });
});
