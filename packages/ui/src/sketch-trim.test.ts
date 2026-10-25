import type { Sketch, SketchId } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { isClosed } from './sketch-profile.js';
import {
  connect,
  emptySketch,
  ensurePoint,
  lineNear,
  type Point2D,
  positionOf,
} from './sketch-tools.js';
import { trimAt } from './sketch-trim.js';

function addLine(sketch: Sketch, start: Point2D, end: Point2D): Sketch {
  const a = ensurePoint(sketch, start);
  const b = ensurePoint(a.sketch, end);
  return connect(b.sketch, a.id, b.id);
}

function lineCoordinates(sketch: Sketch): readonly string[] {
  return sketch.primitives
    .filter((primitive) => primitive.kind === 'line')
    .map((line) => {
      const a = positionOf(sketch, line.start);
      const b = positionOf(sketch, line.end);
      if (a === null || b === null) return '';
      return [`${a.u},${a.v}`, `${b.u},${b.v}`].sort().join(' — ');
    })
    .sort();
}

describe('lineNear', () => {
  it('finds the nearest line and reports the position along it', () => {
    const sketch = addLine(emptySketch(), { u: 0, v: 0 }, { u: 20, v: 0 });

    expect(lineNear(sketch, { u: 5, v: 0.5 })).toMatchObject({ t: 0.25, distance: 0.5 });
    expect(lineNear(sketch, { u: 5, v: 3 })).toBeNull();
  });
});

describe('trimAt', () => {
  it('removes the clicked interval and leaves the lines it crosses whole', () => {
    let sketch = emptySketch();
    sketch = addLine(sketch, { u: 0, v: 0 }, { u: 30, v: 0 });
    sketch = addLine(sketch, { u: 10, v: -10 }, { u: 10, v: 10 });
    sketch = addLine(sketch, { u: 20, v: -10 }, { u: 20, v: 10 });

    const trimmed = trimAt(sketch, { u: 15, v: 0 });

    expect(lineCoordinates(trimmed)).toEqual([
      '0,0 — 10,0',
      '10,-10 — 10,10',
      '20,-10 — 20,10',
      '20,0 — 30,0',
    ]);
    expect(lineNear(trimmed, { u: 15, v: 0 })).toBeNull();
    // The new ends stay on the lines that cut them.
    expect(trimmed.constraints.filter((c) => c.kind === 'pointOn')).toHaveLength(2);
  });

  it('trims a line inside a circle to the circle, past a rectangle around both (audit F-045)', () => {
    let sketch = emptySketch();
    sketch = addLine(sketch, { u: -30, v: 0 }, { u: 30, v: 0 });
    for (const [a, b] of [
      [
        { u: -20, v: -10 },
        { u: 20, v: -10 },
      ],
      [
        { u: 20, v: -10 },
        { u: 20, v: 10 },
      ],
      [
        { u: 20, v: 10 },
        { u: -20, v: 10 },
      ],
      [
        { u: -20, v: 10 },
        { u: -20, v: -10 },
      ],
    ] as const)
      sketch = addLine(sketch, a, b);
    const centre = ensurePoint(sketch, { u: 0, v: 0 });
    sketch = {
      ...centre.sketch,
      primitives: [
        ...centre.sketch.primitives,
        { kind: 'circle', id: 'ring' as SketchId, center: centre.id, radius: 6 },
      ],
    };

    const trimmed = trimAt(sketch, { u: 2, v: 0 }, 0.5);

    // Only the piece inside the circle went; the rectangle's sides are not split.
    expect(lineCoordinates(trimmed)).toEqual([
      '-20,-10 — -20,10',
      '-20,-10 — 20,-10',
      '-20,10 — 20,10',
      '-30,0 — -6,0',
      '20,-10 — 20,10',
      '30,0 — 6,0',
    ]);
    expect(trimmed.primitives.some((p) => p.id === 'ring')).toBe(true);
  });

  it('cuts a circle crossed twice into the arc that is left', () => {
    let sketch = addLine(emptySketch(), { u: -10, v: 0 }, { u: 10, v: 0 });
    const centre = ensurePoint(sketch, { u: 0, v: 0 });
    sketch = {
      ...centre.sketch,
      primitives: [
        ...centre.sketch.primitives,
        { kind: 'circle', id: 'ring' as SketchId, center: centre.id, radius: 5 },
      ],
    };
    // The upper half is clicked and goes; the lower half stays as an arc from (-5,0) round to (5,0).
    const trimmed = trimAt(sketch, { u: 0, v: 5 }, 0.5);
    const arcs = trimmed.primitives.filter((p) => p.kind === 'arc');
    expect(arcs).toHaveLength(1);
    const arc = arcs[0];
    if (arc?.kind !== 'arc') throw new Error('no arc');
    expect(positionOf(trimmed, arc.start)).toMatchObject({ u: -5 });
    expect(positionOf(trimmed, arc.end)).toMatchObject({ u: 5 });
    expect(trimmed.primitives.some((p) => p.kind === 'circle')).toBe(false);
  });

  it('can remove an outside remainder whose only crossing is its endpoint', () => {
    let sketch = emptySketch();
    sketch = addLine(sketch, { u: 10, v: 10 }, { u: 10, v: 0 });
    sketch = addLine(sketch, { u: 10, v: 0 }, { u: 20, v: 0 });
    sketch = addLine(sketch, { u: 20, v: 0 }, { u: 20, v: 10 });
    sketch = addLine(sketch, { u: 0, v: 10 }, { u: 30, v: 10 });

    sketch = trimAt(sketch, { u: 5, v: 10 });
    sketch = trimAt(sketch, { u: 25, v: 10 });

    expect(isClosed(sketch)).toBe(true);
    expect(lineCoordinates(sketch)).toContain('10,10 — 20,10');
  });

  it('leaves the exact sketch object alone when the click misses', () => {
    const sketch = addLine(emptySketch(), { u: 0, v: 0 }, { u: 20, v: 0 });
    expect(trimAt(sketch, { u: 10, v: 10 })).toBe(sketch);
  });

  it('drops constraints attached to lines that have been replaced', () => {
    let sketch = emptySketch();
    sketch = addLine(sketch, { u: 0, v: 0 }, { u: 30, v: 0 });
    const target = sketch.primitives.find((primitive) => primitive.kind === 'line');
    if (target === undefined || target.kind !== 'line') throw new Error('missing test line');
    sketch = {
      primitives: sketch.primitives,
      constraints: [{ kind: 'horizontal', id: 'constraint' as SketchId, line: target.id }],
    };
    sketch = addLine(sketch, { u: 15, v: -10 }, { u: 15, v: 10 });

    const kinds = trimAt(sketch, { u: 5, v: 0 }).constraints.map((c) => c.kind);
    // The line's own constraint went with it; the new end is held on the line that cut it.
    expect(kinds).toEqual(['pointOn']);
  });
});
