import { type ConstraintSolver, createSolver, type Sketch } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { solveInto } from './sketch-constraints.js';
import {
  arcFromCenter,
  circleThrough,
  polygonAt,
  shapeClick,
  slotAt,
  tangentArc,
} from './sketch-shapes.js';
import { connect, emptySketch, ensurePoint, positionOf } from './sketch-tools.js';

let solver: ConstraintSolver;
beforeAll(async () => {
  solver = await createSolver();
});

const kinds = (sketch: Sketch) => sketch.primitives.map((p) => p.kind).filter((k) => k !== 'point');

/** Solved by planegcs: the shape's own relations must hold it as drawn, not fight it. */
function solved(sketch: Sketch | null): Sketch {
  if (sketch === null) throw new Error('no shape');
  const result = solveInto(sketch, solver);
  if (!result.ok) throw new Error(result.message);
  return result.sketch;
}

describe('shapes', () => {
  it('draws a regular hexagon whose corners stay on one circle', () => {
    const hexagon = solved(polygonAt(emptySketch(), { u: 0, v: 0 }, { u: 10, v: 0 }, 6, 1));
    expect(kinds(hexagon).filter((k) => k === 'line')).toHaveLength(6);
    const circle = hexagon.primitives.find((p) => p.kind === 'circle');
    expect(circle).toMatchObject({ construction: true, radius: 10 });
    for (const p of hexagon.primitives)
      if (p.kind === 'point' && (p.x !== 0 || p.y !== 0))
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(10);
  });

  it('draws a slot with tangent sides and round ends of one radius', () => {
    const slot = solved(slotAt(emptySketch(), { u: 0, v: 0 }, { u: 20, v: 0 }, { u: 5, v: 4 }, 1));
    expect(kinds(slot).sort()).toEqual(['arc', 'arc', 'line', 'line']);
    const ys = slot.primitives.flatMap((p) => (p.kind === 'point' ? [p.y] : []));
    expect(Math.max(...ys)).toBeCloseTo(4);
    expect(Math.min(...ys)).toBeCloseTo(-4);
  });

  it('draws the circle through three points', () => {
    const circle = circleThrough(
      emptySketch(),
      { u: 10, v: 0 },
      { u: 0, v: 10 },
      { u: -10, v: 0 },
      1,
    );
    expect(circle?.primitives.find((p) => p.kind === 'circle')).toMatchObject({ radius: 10 });
  });

  it('draws an arc from its centre, its end brought onto the circle', () => {
    const arc = arcFromCenter(emptySketch(), { u: 0, v: 0 }, { u: 5, v: 0 }, { u: 0, v: 20 }, 1);
    const end = arc?.primitives.find((p) => p.kind === 'arc');
    if (arc === null || arc === undefined || end?.kind !== 'arc') throw new Error('no arc');
    expect(positionOf(arc, end.end)).toEqual({ u: expect.closeTo(0), v: expect.closeTo(5) });
  });

  it('leaves the end of a line along it, bending toward the click, and stays tangent', () => {
    const a = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const b = ensurePoint(a.sketch, { u: 10, v: 0 });
    const line = connect(b.sketch, a.id, b.id);
    const bent = solved(tangentArc(line, { u: 10, v: 0 }, { u: 15, v: 5 }, 1));
    const arc = bent.primitives.find((p) => p.kind === 'arc');
    if (arc?.kind !== 'arc') throw new Error('no arc');
    // Bending left from a line running along +x: the centre is straight above the line's end.
    expect(positionOf(bent, arc.center)).toEqual({ u: expect.closeTo(10), v: expect.closeTo(5) });
    expect(bent.constraints.some((c) => c.kind === 'tangent')).toBe(true);
  });

  it('refuses a tangent arc that does not start on the end of a line', () => {
    const step = shapeClick('tangent-arc', emptySketch(), [], { u: 3, v: 3 }, 1);
    expect(step.message).toBe('Start a tangent arc on the end of a line.');
    expect(step.clicks).toEqual([]);
  });

  it('gathers clicks until the shape has all it needs', () => {
    const first = shapeClick('slot', emptySketch(), [], { u: 0, v: 0 }, 1);
    expect(first.sketch).toBeNull();
    const second = shapeClick('slot', emptySketch(), first.clicks, { u: 10, v: 0 }, 1);
    const third = shapeClick('slot', emptySketch(), second.clicks, { u: 2, v: 3 }, 1);
    expect(third.clicks).toEqual([]);
    expect(third.sketch?.primitives.some((p) => p.kind === 'arc')).toBe(true);
  });
});
