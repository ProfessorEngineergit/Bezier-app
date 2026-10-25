import { describe, expect, it } from 'vitest';
import { lineLength, setLineLength } from './sketch-dimensions.js';
import { connect, emptySketch, ensurePoint, positionOf, rectangleAt } from './sketch-tools.js';

function oneLine() {
  const a = ensurePoint(emptySketch(), { u: 2, v: 3 });
  const b = ensurePoint(a.sketch, { u: 8, v: 11 });
  const sketch = connect(b.sketch, a.id, b.id);
  const line = sketch.primitives.find((primitive) => primitive.kind === 'line');
  if (line === undefined || line.kind !== 'line') throw new Error('missing test line');
  return { sketch, line };
}

describe('line dimensions', () => {
  it('reads the geometric length', () => {
    const { sketch, line } = oneLine();
    expect(lineLength(sketch, line.id)).toBe(10);
  });

  it('moves the end point along the line and records the entered distance', () => {
    const { sketch, line } = oneLine();
    const next = setLineLength(sketch, line.id, 25);

    expect(lineLength(next, line.id)).toBeCloseTo(25);
    expect(positionOf(next, line.start)).toEqual({ u: 2, v: 3 });
    expect(next.constraints).toContainEqual({
      kind: 'distance',
      id: 'd0',
      a: line.start,
      b: line.end,
      value: 25,
    });
  });

  it('updates the existing dimension instead of stacking another one', () => {
    const { sketch, line } = oneLine();
    const once = setLineLength(sketch, line.id, 25);
    const twice = setLineLength(once, line.id, 12.5);

    expect(lineLength(twice, line.id)).toBeCloseTo(12.5);
    expect(twice.constraints).toHaveLength(1);
    expect(twice.constraints[0]).toMatchObject({ kind: 'distance', value: 12.5 });
  });

  it('keeps the opposite rectangle side aligned when its width changes', () => {
    const sketch = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 10, v: 5 });
    const horizontal = sketch.constraints.find((constraint) => constraint.kind === 'horizontal');
    if (horizontal === undefined || horizontal.kind !== 'horizontal') {
      throw new Error('missing horizontal rectangle constraint');
    }

    const next = setLineLength(sketch, horizontal.line, 25);
    const xs = next.primitives
      .filter((primitive) => primitive.kind === 'point')
      .map((point) => point.x)
      .sort((a, b) => a - b);

    expect(xs).toEqual([0, 0, 25, 25]);
  });

  it('refuses non-positive or non-finite values', () => {
    const { sketch, line } = oneLine();
    expect(setLineLength(sketch, line.id, 0)).toBe(sketch);
    expect(setLineLength(sketch, line.id, Number.NaN)).toBe(sketch);
  });
});
