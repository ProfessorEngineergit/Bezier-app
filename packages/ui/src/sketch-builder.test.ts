import { describe, expect, it } from 'vitest';
import {
  addToSketch,
  distanceBetween,
  lineSketch,
  lockPoint,
  rectangleSketch,
} from './sketch-builder.js';

describe('rectangleSketch', () => {
  it('produces four corners and four lines', () => {
    const sketch = rectangleSketch('r1', { x: 0, y: 0, width: 40, height: 20 });
    const points = sketch.primitives.filter((p) => p.kind === 'point');
    const lines = sketch.primitives.filter((p) => p.kind === 'line');

    expect(points).toHaveLength(4);
    expect(lines).toHaveLength(4);
  });

  it('closes the loop — the last line returns to the first point', () => {
    const sketch = rectangleSketch('r1', { x: 0, y: 0, width: 40, height: 20 });
    const lines = sketch.primitives.filter((p) => p.kind === 'line');

    expect(lines[3]).toMatchObject({ start: 'r1-p3', end: 'r1-p0' });
  });

  it('places the corners anticlockwise from the lower left', () => {
    const sketch = rectangleSketch('r1', { x: 5, y: 7, width: 40, height: 20 });
    const corners = sketch.primitives
      .filter((p) => p.kind === 'point')
      .map((p) => (p.kind === 'point' ? [p.x, p.y] : []));

    expect(corners).toEqual([
      [5, 7],
      [45, 7],
      [45, 27],
      [5, 27],
    ]);
  });

  it('constrains it to stay a rectangle', () => {
    // Four lines that only look rectangular come apart on the first dimension change. This is what
    // makes it parametric and not drawn.
    const sketch = rectangleSketch('r1', { x: 0, y: 0, width: 40, height: 20 });
    const kinds = sketch.constraints.map((c) => c.kind).sort();

    expect(kinds).toEqual(['horizontal', 'horizontal', 'vertical', 'vertical']);
  });

  it('constrains the two horizontal sides, not two adjacent ones', () => {
    const sketch = rectangleSketch('r1', { x: 0, y: 0, width: 40, height: 20 });
    const horizontal = sketch.constraints
      .filter((c) => c.kind === 'horizontal')
      .map((c) => (c.kind === 'horizontal' ? c.line : ''));

    // Opposite sides, so the shape cannot collapse into a parallelogram.
    expect(horizontal).toEqual(['r1-l0', 'r1-l2']);
  });

  it('gives every id the caller’s prefix, so two sketches never collide', () => {
    const a = rectangleSketch('a', { x: 0, y: 0, width: 10, height: 10 });
    const b = rectangleSketch('b', { x: 0, y: 0, width: 10, height: 10 });

    const idsA = new Set(a.primitives.map((p) => p.id));
    for (const primitive of b.primitives) expect(idsA.has(primitive.id)).toBe(false);
  });

  it('is deterministic — the same rectangle twice is byte-identical', () => {
    // Replay has to land in the same place on another machine tomorrow (ADR 0009), so ids may not
    // come from a counter or a random source.
    const first = rectangleSketch('r1', { x: 1, y: 2, width: 30, height: 15 });
    const second = rectangleSketch('r1', { x: 1, y: 2, width: 30, height: 15 });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('lineSketch', () => {
  it('draws an unconstrained segment between two new points', () => {
    const sketch = lineSketch('l1', [0, 0], [10, 5]);

    expect(sketch.primitives).toHaveLength(3);
    expect(sketch.constraints).toEqual([]);
    expect(sketch.primitives[2]).toMatchObject({ kind: 'line', start: 'l1-a', end: 'l1-b' });
  });
});

describe('addToSketch', () => {
  it('appends without disturbing what was already there', () => {
    const base = rectangleSketch('r1', { x: 0, y: 0, width: 40, height: 20 });
    const grown = addToSketch(base, [], [distanceBetween('d1', 'r1-p0', 'r1-p1', 50)]);

    expect(grown.primitives).toEqual(base.primitives);
    expect(grown.constraints).toHaveLength(base.constraints.length + 1);
  });

  it('leaves the original untouched', () => {
    const base = rectangleSketch('r1', { x: 0, y: 0, width: 40, height: 20 });
    addToSketch(base, [], [lockPoint('k1', 'r1-p0', 0, 0)]);

    expect(base.constraints).toHaveLength(4);
  });

  it('refuses a duplicate id rather than silently constraining the wrong thing', () => {
    const base = rectangleSketch('r1', { x: 0, y: 0, width: 40, height: 20 });

    expect(() => addToSketch(base, [], [lockPoint('r1-h0', 'r1-p0', 0, 0)])).toThrow(
      /already contains an id/,
    );
  });

  it('catches a duplicate inside the batch being added', () => {
    const base = rectangleSketch('r1', { x: 0, y: 0, width: 40, height: 20 });

    expect(() =>
      addToSketch(base, [], [lockPoint('k1', 'r1-p0', 0, 0), lockPoint('k1', 'r1-p1', 1, 1)]),
    ).toThrow(/already contains an id/);
  });
});
