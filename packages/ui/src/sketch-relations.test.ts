import type { Sketch, SketchConstraint } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { constrain, dimension, setConstraintValue } from './sketch-constraints.js';
import { deleteSketchPrimitives } from './sketch-delete.js';
import {
  anchorAtOrigin,
  connect,
  emptySketch,
  ensurePoint,
  snapSketchPoint,
} from './sketch-tools.js';

/** A line from (0,0) to (10,0), and a loose point q at (4,3). */
function lineAndPoint(): { sketch: Sketch; line: string; q: string; a: string; b: string } {
  const a = ensurePoint(emptySketch(), { u: 0, v: 0 });
  const b = ensurePoint(a.sketch, { u: 10, v: 0 });
  const joined = connect(b.sketch, a.id, b.id);
  const q = ensurePoint(joined, { u: 4, v: 3 });
  const line = q.sketch.primitives.find((p) => p.kind === 'line')?.id ?? '';
  return { sketch: q.sketch, line, q: q.id, a: a.id, b: b.id };
}

const only = (result: ReturnType<typeof constrain>): SketchConstraint => {
  if (!result.ok) throw new Error(result.message);
  const [first] = result.added;
  if (first === undefined) throw new Error('nothing added');
  return first;
};

describe('relations on points', () => {
  it('puts a point on a line, at its middle, or at a held distance from it', () => {
    const { sketch, line, q } = lineAndPoint();
    expect(only(constrain(sketch, 'pointOn', [q, line]))).toMatchObject({
      kind: 'pointOn',
      point: q,
      on: line,
    });
    expect(only(constrain(sketch, 'midpoint', [line, q]))).toMatchObject({ point: q, line });
    expect(only(constrain(sketch, 'pointLineDistance', [q, line]))).toMatchObject({ value: 3 });
  });

  it('holds two points apart as they stand: straight, along x, along y, signed', () => {
    const { sketch, a, q } = lineAndPoint();
    expect(only(constrain(sketch, 'distance', [a, q]))).toMatchObject({ value: 5 });
    expect(only(constrain(sketch, 'horizontalDistance', [q, a]))).toMatchObject({ value: -4 });
    expect(only(constrain(sketch, 'verticalDistance', [a, q]))).toMatchObject({ value: 3 });
  });

  it('mirrors two points about a line, or about the third point picked', () => {
    const { sketch, line, a, q } = lineAndPoint();
    expect(only(constrain(sketch, 'symmetric', [a, q, line]))).toMatchObject({
      a,
      b: q,
      about: line,
    });
    const { b } = lineAndPoint();
    expect(only(constrain(sketch, 'symmetric', [a, q, b]))).toMatchObject({ about: b });
    expect(constrain(sketch, 'symmetric', [a, q]).ok).toBe(false);
  });

  it('keeps the side of a horizontal distance when a value is typed', () => {
    const { sketch, a, q } = lineAndPoint();
    const result = constrain(sketch, 'horizontalDistance', [q, a]);
    if (!result.ok) throw new Error(result.message);
    const id = result.added[0]?.id ?? '';
    const typed = setConstraintValue(result.sketch, id, 7);
    expect(typed.constraints.find((c) => c.id === id)).toMatchObject({ value: -7 });
  });

  it('turns a length into a reference and back, without adding anything', () => {
    const { sketch, line } = lineAndPoint();
    const sized = dimension(sketch, line, 10);
    const flipped = constrain(sized, 'reference', [line]);
    if (!flipped.ok) throw new Error(flipped.message);
    expect(flipped.sketch.constraints.find((c) => c.kind === 'distance')).toMatchObject({
      reference: true,
    });
    const back = constrain(flipped.sketch, 'reference', [line]);
    if (!back.ok) throw new Error(back.message);
    expect(back.sketch.constraints.find((c) => c.kind === 'distance')).not.toHaveProperty(
      'reference',
    );
    expect(constrain(sketch, 'reference', [line]).ok).toBe(false);
  });

  it('drops a relation with the line it names when that line is deleted', () => {
    const { sketch, line, q } = lineAndPoint();
    const result = constrain(sketch, 'pointOn', [q, line]);
    if (!result.ok) throw new Error(result.message);
    expect(deleteSketchPrimitives(result.sketch, new Set([line])).constraints).toEqual([]);
  });

  it('levels two picked points with Horizontal, as it levels a line', () => {
    const { sketch, a, q } = lineAndPoint();
    expect(only(constrain(sketch, 'horizontal', [a, q]))).toMatchObject({
      kind: 'horizontalPoints',
      a,
      b: q,
    });
    expect(only(constrain(sketch, 'vertical', [a, q])).kind).toBe('verticalPoints');
  });

  it('holds the ratio two lines stand at, and takes a typed one', () => {
    const first = lineAndPoint();
    const b2 = ensurePoint(first.sketch, { u: 4, v: 23 });
    const both = connect(b2.sketch, first.q, b2.id);
    const [one, two] = both.primitives.filter((p) => p.kind === 'line').map((p) => p.id);
    const result = constrain(both, 'lengthRatio', [one ?? '', two ?? '']);
    if (!result.ok) throw new Error(result.message);
    const ratio = result.added[0];
    expect(ratio).toMatchObject({ kind: 'lengthRatio', ratio: 2 });
    const typed = setConstraintValue(result.sketch, ratio?.id ?? '', 3);
    expect(typed.constraints.find((c) => c.id === ratio?.id)).toMatchObject({ ratio: 3 });
  });

  it('asks for three lines, or two pairs, for an equal angle', () => {
    const { sketch, line } = lineAndPoint();
    expect(constrain(sketch, 'equalAngle', [line]).ok).toBe(false);
  });
});

describe('the origin as an anchor', () => {
  it('snaps a click near the origin onto it', () => {
    expect(snapSketchPoint(emptySketch(), { u: 0.3, v: -0.4 }, 1)).toEqual({ u: 0, v: 0 });
    expect(snapSketchPoint(emptySketch(), { u: 3, v: 4 }, 1)).toEqual({ u: 3, v: 4 });
  });

  it('holds on the origin a point a drawing step put there, once', () => {
    const start = emptySketch();
    const drawn = ensurePoint(start, { u: 0, v: 0 }).sketch;
    const held = anchorAtOrigin(start, drawn);
    expect(held.constraints).toEqual([expect.objectContaining({ kind: 'lock', x: 0, y: 0 })]);
    const again = ensurePoint(held, { u: 5, v: 5 }).sketch;
    expect(anchorAtOrigin(held, again).constraints).toHaveLength(1);
  });
});
