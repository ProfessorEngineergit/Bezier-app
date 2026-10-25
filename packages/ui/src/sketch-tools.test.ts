import { sketchProfiles } from '@bezier/core';
import type { SolveResult } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { arcThrough, circleFromCenter } from './sketch-curves.js';
import { deleteSketchPrimitives } from './sketch-delete.js';
import { closedProfileContains, isClosed } from './sketch-profile.js';
import {
  centerRectangleAt,
  connect,
  emptySketch,
  ensurePoint,
  pointNear,
  positionOf,
  rectangleAt,
  snapSketchPoint,
  snapToGrid,
} from './sketch-tools.js';

/** What the placeholder solver does: every point stays where it was drawn. */
function solveAsDrawn(sketch: ReturnType<typeof emptySketch>): SolveResult {
  const positions = new Map<string, { x: number; y: number }>();
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'point') positions.set(primitive.id, { x: primitive.x, y: primitive.y });
  }
  return {
    status: 'under-constrained',
    positions,
    radii: new Map(),
    dof: positions.size * 2,
    conflicting: [],
    redundant: [],
  };
}

describe('ensurePoint', () => {
  it('creates a point when nothing is near', () => {
    const step = ensurePoint(emptySketch(), { u: 5, v: 7 });
    expect(step.joined).toBe(false);
    expect(positionOf(step.sketch, step.id)).toEqual({ u: 5, v: 7 });
  });

  it('joins an existing point rather than stacking a second one on it', () => {
    const first = ensurePoint(emptySketch(), { u: 5, v: 7 });
    const second = ensurePoint(first.sketch, { u: 5.4, v: 7.2 });

    expect(second.joined).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.sketch.primitives).toHaveLength(1);
  });

  it('joins the nearest point, not the first one found', () => {
    let sketch = emptySketch();
    const far = ensurePoint(sketch, { u: 0, v: 0 });
    sketch = far.sketch;
    const near = ensurePoint(sketch, { u: 1.2, v: 0 });
    sketch = near.sketch;

    expect(pointNear(sketch, { u: 1.1, v: 0 })).toBe(near.id);
  });
});

describe('grid snapping', () => {
  it('rounds a free point to the configured millimetre step', () => {
    expect(snapToGrid({ u: 12.4, v: -7.6 }, 5)).toEqual({ u: 10, v: -10 });
    expect(snapToGrid({ u: 12.4, v: -7.6 }, null)).toEqual({ u: 12.4, v: -7.6 });
  });

  it('prefers an existing endpoint over the grid', () => {
    const point = ensurePoint(emptySketch(), { u: 9.4, v: 10.6 });
    expect(snapSketchPoint(point.sketch, { u: 9.8, v: 10.2 }, 1, 5)).toEqual({
      u: 9.4,
      v: 10.6,
    });
    expect(snapSketchPoint(point.sketch, { u: 16.8, v: 12.4 }, 1, 5)).toEqual({
      u: 15,
      v: 10,
    });
  });
});

describe('the tolerance is an argument, not a constant', () => {
  /**
   * The preview and the click must snap with the same tolerance, converted from pixels for the
   * current zoom; otherwise the click snaps to a point the preview did not show and the line jumps
   * on release.
   */
  it('snaps at whatever reach it is given, not at a fixed one', () => {
    const anchor = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const away = { u: 6, v: 0 };

    // Beyond 1.5 mm, comfortably inside a zoomed-out reach.
    expect(snapSketchPoint(anchor.sketch, away, 1.5, null)).toEqual(away);
    expect(snapSketchPoint(anchor.sketch, away, 10, null)).toEqual({ u: 0, v: 0 });
  });

  it('lets the grid answer only when nothing is in reach', () => {
    const anchor = ensurePoint(emptySketch(), { u: 0, v: 0 });
    // An existing endpoint always wins: it is what makes a drawn loop close on shared ids and not
    // just meet at the same coordinates.
    expect(snapSketchPoint(anchor.sketch, { u: 1, v: 0 }, 10, 5)).toEqual({ u: 0, v: 0 });
    expect(snapSketchPoint(anchor.sketch, { u: 14, v: 0 }, 10, 5)).toEqual({ u: 15, v: 0 });
  });
});

describe('connect', () => {
  it('refuses a zero-length line', () => {
    const step = ensurePoint(emptySketch(), { u: 0, v: 0 });
    expect(connect(step.sketch, step.id, step.id)).toBe(step.sketch);
  });

  it('refuses to draw the same line twice, in either direction', () => {
    const a = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const b = ensurePoint(a.sketch, { u: 10, v: 0 });
    const once = connect(b.sketch, a.id, b.id);

    expect(connect(once, a.id, b.id)).toBe(once);
    expect(connect(once, b.id, a.id)).toBe(once);
  });
});

describe('rectangleAt', () => {
  it('is four lines over four shared points', () => {
    const sketch = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 20 });

    expect(sketch.primitives.filter((p) => p.kind === 'point')).toHaveLength(4);
    expect(sketch.primitives.filter((p) => p.kind === 'line')).toHaveLength(4);
  });

  it('constrains its sides, so it stays a rectangle', () => {
    const sketch = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 20 });
    const kinds = sketch.constraints.map((c) => c.kind).sort();
    expect(kinds).toEqual(['horizontal', 'horizontal', 'vertical', 'vertical']);
  });

  it('is the same whichever pair of opposite corners is dragged', () => {
    const a = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 20 });
    const b = rectangleAt(emptySketch(), { u: 40, v: 20 }, { u: 0, v: 0 });
    expect(b.primitives).toEqual(a.primitives);
  });

  it('ignores a drag with no area', () => {
    const sketch = emptySketch();
    expect(rectangleAt(sketch, { u: 5, v: 5 }, { u: 5, v: 5 })).toBe(sketch);
  });

  it('keeps the ids it has always given a fresh rectangle', () => {
    const sketch = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 20 });
    expect(sketch.constraints.map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3']);
  });

  it('puts each constraint on the axis of its own side when drawn onto an existing edge', () => {
    const first = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 30 });
    // Drawn downwards from the first one's bottom edge, which the two share. That side is not
    // created again, and the later sides must stay on their own axes or the rectangle folds once
    // solved.
    const both = rectangleAt(first, { u: 0, v: 0 }, { u: 40, v: -20 });

    expect(both.constraints).toHaveLength(7);
    for (const constraint of both.constraints) {
      if (constraint.kind !== 'horizontal' && constraint.kind !== 'vertical') continue;
      const line = both.primitives.find((p) => p.id === constraint.line);
      if (line?.kind !== 'line') throw new Error(`${constraint.id} names no line`);
      const start = positionOf(both, line.start);
      const end = positionOf(both, line.end);
      if (start === null || end === null) throw new Error(`${line.id} has no endpoints`);
      if (constraint.kind === 'horizontal') expect(end.v).toBeCloseTo(start.v, 9);
      else expect(end.u).toBeCloseTo(start.u, 9);
    }
  });

  it('never gives a constraint an id already in use, even after one was deleted', () => {
    const first = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 30 });
    const side = first.primitives.filter((p) => p.kind === 'line')[1];
    if (side === undefined) throw new Error('the rectangle has no second side');
    // Removing a side removes its constraint too, so the count of constraints no longer names a
    // free id.
    const trimmed = deleteSketchPrimitives(first, new Set([side.id]));
    const next = rectangleAt(trimmed, { u: 100, v: 0 }, { u: 120, v: 10 });

    const ids = [...next.primitives.map((p) => p.id), ...next.constraints.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('centerRectangleAt', () => {
  it('mirrors the chosen corner across the centre', () => {
    const sketch = centerRectangleAt(emptySketch(), { u: 10, v: 20 }, { u: 25, v: 35 });
    const points = sketch.primitives
      .filter((primitive) => primitive.kind === 'point')
      .map((point) => [point.x, point.y]);

    expect(points).toEqual([
      [-5, 5],
      [25, 5],
      [25, 35],
      [-5, 35],
    ]);
    expect(isClosed(sketch)).toBe(true);
  });
});

describe('isClosed', () => {
  it('rejects an open chain', () => {
    let sketch = emptySketch();
    const a = ensurePoint(sketch, { u: 0, v: 0 });
    const b = ensurePoint(a.sketch, { u: 10, v: 0 });
    const c = ensurePoint(b.sketch, { u: 10, v: 10 });
    sketch = connect(connect(c.sketch, a.id, b.id), b.id, c.id);

    expect(isClosed(sketch)).toBe(false);
  });

  it('accepts a triangle closed by snapping back onto the first point', () => {
    let sketch = emptySketch();
    const a = ensurePoint(sketch, { u: 0, v: 0 });
    const b = ensurePoint(a.sketch, { u: 10, v: 0 });
    const c = ensurePoint(b.sketch, { u: 10, v: 10 });
    sketch = connect(connect(c.sketch, a.id, b.id), b.id, c.id);

    // The click that closes it lands near the start, so it joins and does not make a fourth point,
    // which is what makes the loop a loop.
    const back = ensurePoint(sketch, { u: 0.3, v: 0.2 });
    expect(back.id).toBe(a.id);
    expect(isClosed(connect(back.sketch, c.id, back.id))).toBe(true);
  });

  it('accepts a rectangle', () => {
    expect(isClosed(rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 20 }))).toBe(true);
  });

  it('splits a closed line chain that crosses itself into the two triangles it makes', () => {
    const topLeft = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const bottomRight = ensurePoint(topLeft.sketch, { u: 20, v: 20 });
    const bottomLeft = ensurePoint(bottomRight.sketch, { u: 0, v: 20 });
    const topRight = ensurePoint(bottomLeft.sketch, { u: 20, v: 0 });
    let sketch = connect(topRight.sketch, topLeft.id, bottomRight.id);
    sketch = connect(sketch, bottomRight.id, bottomLeft.id);
    sketch = connect(sketch, bottomLeft.id, topRight.id);
    sketch = connect(sketch, topRight.id, topLeft.id);

    // How every CAD tool reads a bow tie: two closed areas meeting at the crossing.
    expect(isClosed(sketch)).toBe(true);
    expect(closedProfileContains(sketch, { u: 10, v: 4 })).toBe(true);
    const built = sketchProfiles(sketch, solveAsDrawn(sketch), 'XY');
    expect(built.ok && built.profiles).toHaveLength(2);
  });

  it('accepts a circle as a closed profile', () => {
    const center = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const circle = circleFromCenter(center.sketch, center.id, { u: 12, v: 0 });

    expect(isClosed(circle)).toBe(true);
  });

  it('accepts a line loop with an exact arc cap', () => {
    const left = ensurePoint(emptySketch(), { u: -10, v: 0 });
    const right = ensurePoint(left.sketch, { u: 10, v: 0 });
    const bottomRight = ensurePoint(right.sketch, { u: 10, v: -10 });
    const bottomLeft = ensurePoint(bottomRight.sketch, { u: -10, v: -10 });
    let sketch = arcThrough(bottomLeft.sketch, left.id, right.id, { u: 0, v: 10 });
    sketch = connect(sketch, right.id, bottomRight.id);
    sketch = connect(sketch, bottomRight.id, bottomLeft.id);
    sketch = connect(sketch, bottomLeft.id, left.id);

    expect(isClosed(sketch)).toBe(true);
  });

  it('offers two separate loops as two areas', () => {
    const first = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 20 });
    const second = rectangleAt(first, { u: 60, v: 0 }, { u: 100, v: 20 });

    expect(isClosed(second)).toBe(true);
    expect(closedProfileContains(second, { u: 80, v: 10 })).toBe(true);
    expect(closedProfileContains(second, { u: 50, v: 10 })).toBe(false);
  });
});

describe('closedProfileContains', () => {
  const rectangle = rectangleAt(emptySketch(), { u: -20, v: -10 }, { u: 20, v: 10 });

  it('accepts a point inside the closed profile', () => {
    expect(closedProfileContains(rectangle, { u: 0, v: 0 })).toBe(true);
  });

  it('rejects a point outside the closed profile', () => {
    expect(closedProfileContains(rectangle, { u: 30, v: 0 })).toBe(false);
  });

  it('rejects geometry that is not a buildable profile', () => {
    const a = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const b = ensurePoint(a.sketch, { u: 10, v: 0 });
    expect(closedProfileContains(connect(b.sketch, a.id, b.id), { u: 5, v: 0 })).toBe(false);
  });

  it('picks the inside of a circle without a polygon approximation', () => {
    const center = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const circle = circleFromCenter(center.sketch, center.id, { u: 12, v: 0 });

    expect(closedProfileContains(circle, { u: 0, v: 11.9 })).toBe(true);
    expect(closedProfileContains(circle, { u: 0, v: 12.1 })).toBe(false);
  });
});

/**
 * The join that matters: what the tools draw has to be what the profile builder can walk. The two
 * have no compile-time contract, so it is checked here.
 */
describe('drawn sketches reach the kernel', () => {
  it('turns a drawn rectangle into a closed profile on its plane', () => {
    const sketch = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 40, v: 20 });
    const result = sketchProfiles(sketch, solveAsDrawn(sketch), 'XY');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profiles[0]?.profile.loops[0]).toHaveLength(4);
    expect(result.profiles[0]?.profile.normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('turns a hand-drawn closed triangle into a profile', () => {
    let sketch = emptySketch();
    const a = ensurePoint(sketch, { u: 0, v: 0 });
    const b = ensurePoint(a.sketch, { u: 30, v: 0 });
    const c = ensurePoint(b.sketch, { u: 15, v: 25 });
    sketch = connect(connect(connect(c.sketch, a.id, b.id), b.id, c.id), c.id, a.id);

    const result = sketchProfiles(sketch, solveAsDrawn(sketch), 'XZ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profiles[0]?.profile.loops[0]).toHaveLength(3);
  });

  it('keeps a drawn circle exact in the kernel profile', () => {
    const center = ensurePoint(emptySketch(), { u: 4, v: 6 });
    const sketch = circleFromCenter(center.sketch, center.id, { u: 16, v: 6 });
    const result = sketchProfiles(sketch, solveAsDrawn(sketch), 'XY');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profiles[0]?.profile.loops[0]).toEqual([
      { kind: 'circle', center: { x: 4, y: 6 }, radius: 12 },
    ]);
  });

  it('keeps an arc exact inside a mixed profile', () => {
    const left = ensurePoint(emptySketch(), { u: -10, v: 0 });
    const right = ensurePoint(left.sketch, { u: 10, v: 0 });
    const bottomRight = ensurePoint(right.sketch, { u: 10, v: -10 });
    const bottomLeft = ensurePoint(bottomRight.sketch, { u: -10, v: -10 });
    let sketch = arcThrough(bottomLeft.sketch, left.id, right.id, { u: 0, v: 10 });
    sketch = connect(sketch, right.id, bottomRight.id);
    sketch = connect(sketch, bottomRight.id, bottomLeft.id);
    sketch = connect(sketch, bottomLeft.id, left.id);
    const result = sketchProfiles(sketch, solveAsDrawn(sketch), 'XY');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const segment = result.profiles[0]?.profile.loops[0]?.find((item) => item.kind === 'arc');
    expect(segment?.kind).toBe('arc');
    if (segment?.kind !== 'arc') return;
    expect(new Set([segment.start.x, segment.end.x])).toEqual(new Set([-10, 10]));
    expect(segment.mid.x).toBeCloseTo(0, 8);
    expect(segment.mid.y).toBeCloseTo(10, 8);
  });

  it('finds no area in an open chain, rather than extruding a shape nobody drew', () => {
    let sketch = emptySketch();
    const a = ensurePoint(sketch, { u: 0, v: 0 });
    const b = ensurePoint(a.sketch, { u: 10, v: 0 });
    const c = ensurePoint(b.sketch, { u: 10, v: 10 });
    sketch = connect(connect(c.sketch, a.id, b.id), b.id, c.id);

    const result = sketchProfiles(sketch, solveAsDrawn(sketch), 'XY');
    expect(result.ok && result.profiles).toEqual([]);
  });
});
