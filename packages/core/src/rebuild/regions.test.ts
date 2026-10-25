/**
 * Regions a sketch encloses: separate shapes, holes, overlaps, a splitting line, and stray
 * geometry that must not break the rest.
 */

import type { Sketch, SketchPrimitive } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { drawnGeometry, regionAt, sketchRegions } from './regions.js';

function rectangle(prefix: string, x0: number, y0: number, x1: number, y1: number) {
  const corners: [string, number, number][] = [
    [`${prefix}p0`, x0, y0],
    [`${prefix}p1`, x1, y0],
    [`${prefix}p2`, x1, y1],
    [`${prefix}p3`, x0, y1],
  ];
  const primitives: SketchPrimitive[] = corners.map(([id, x, y]) => ({ kind: 'point', id, x, y }));
  corners.forEach(([id], i) => {
    const next = corners[(i + 1) % 4]?.[0] ?? id;
    primitives.push({ kind: 'line', id: `${prefix}l${i}`, start: id, end: next });
  });
  return primitives;
}

function circle(id: string, x: number, y: number, radius: number): SketchPrimitive[] {
  return [
    { kind: 'point', id: `${id}c`, x, y },
    { kind: 'circle', id, center: `${id}c`, radius },
  ];
}

function regionsOf(...parts: SketchPrimitive[][]) {
  const sketch: Sketch = { primitives: parts.flat(), constraints: [] };
  return sketchRegions(sketch, drawnGeometry(sketch));
}

const areas = (regions: ReturnType<typeof regionsOf>) =>
  regions.map((region) => Math.round(region.area * 1000) / 1000).sort((a, b) => a - b);

describe('the areas a sketch encloses', () => {
  it('finds one area in one rectangle', () => {
    const regions = regionsOf(rectangle('a', 0, 0, 40, 20));
    expect(areas(regions)).toEqual([800]);
    expect(regions[0]?.loops).toHaveLength(1);
    expect(regions[0]?.loops[0]).toHaveLength(4);
  });

  it('finds one area in a rectangle with one side drawn twice, as a DXF may have it', () => {
    // Audit F-069: a doubled side closes a sliver, and the real area must still be found.
    const regions = regionsOf(rectangle('a', 0, 0, 40, 20), [
      { kind: 'point', id: 'd0', x: 0, y: 0 },
      { kind: 'point', id: 'd1', x: 40, y: 0 },
      { kind: 'line', id: 'dl', start: 'd0', end: 'd1' },
    ]);
    expect(areas(regions)).toEqual([800]);
    expect(regions[0]?.loops[0]).toHaveLength(4);
  });

  it('finds two areas in two separate rectangles', () => {
    const regions = regionsOf(rectangle('a', 0, 0, 10, 10), rectangle('b', 20, 0, 30, 10));
    expect(areas(regions)).toEqual([100, 100]);
  });

  it('makes a circle inside a rectangle a hole, and the circle an area of its own', () => {
    const regions = regionsOf(rectangle('a', 0, 0, 40, 40), circle('c', 20, 20, 5));
    const ring = regions.find((region) => region.loops.length === 2);
    // Areas come from the sampled outline, so a curve's is close and not exact. Only the ordering
    // by size depends on it; the loops handed on are exact.
    expect(Math.abs((ring?.area ?? 0) - (1600 - Math.PI * 25))).toBeLessThan(0.5);
    expect(ring?.loops[1]).toEqual([{ kind: 'circle', center: { x: 20, y: 20 }, radius: 5 }]);
    const disc = regions.find((region) => region.loops.length === 1);
    expect(disc?.loops[0]).toEqual([{ kind: 'circle', center: { x: 20, y: 20 }, radius: 5 }]);
    expect(regionAt(regions, { x: 20, y: 20 })?.key).toBe(disc?.key);
    expect(regionAt(regions, { x: 2, y: 2 })?.key).toBe(ring?.key);
  });

  it('splits two overlapping rectangles into the three areas they make', () => {
    const regions = regionsOf(rectangle('a', 0, 0, 20, 20), rectangle('b', 10, 10, 30, 30));
    expect(areas(regions)).toEqual([100, 300, 300]);
  });

  it('splits a rectangle crossed by a line into two areas', () => {
    const regions = regionsOf(rectangle('a', 0, 0, 20, 10), [
      { kind: 'point', id: 'm0', x: 5, y: -5 },
      { kind: 'point', id: 'm1', x: 5, y: 15 },
      { kind: 'line', id: 'm', start: 'm0', end: 'm1' },
    ]);
    expect(areas(regions)).toEqual([50, 150]);
  });

  it('ignores a stray line and construction geometry', () => {
    const regions = regionsOf(rectangle('a', 0, 0, 10, 10), [
      { kind: 'point', id: 's0', x: 50, y: 50 },
      { kind: 'point', id: 's1', x: 60, y: 50 },
      { kind: 'line', id: 's', start: 's0', end: 's1' },
      { kind: 'point', id: 'k0', x: -5, y: 5 },
      { kind: 'point', id: 'k1', x: 15, y: 5 },
      { kind: 'line', id: 'k', start: 'k0', end: 'k1', construction: true },
    ]);
    expect(areas(regions)).toEqual([100]);
  });

  it('closes a loop of a line and an arc', () => {
    const regions = regionsOf([
      { kind: 'point', id: 'a', x: -10, y: 0 },
      { kind: 'point', id: 'b', x: 10, y: 0 },
      { kind: 'point', id: 'o', x: 0, y: 0 },
      { kind: 'line', id: 'l', start: 'b', end: 'a' },
      // Counter-clockwise from b to a: the upper half.
      { kind: 'arc', id: 'r', center: 'o', start: 'b', end: 'a' },
    ]);
    expect(regions).toHaveLength(1);
    expect(Math.abs((regions[0]?.area ?? 0) - (Math.PI * 100) / 2)).toBeLessThan(0.5);
    const segments = regions[0]?.loops[0] ?? [];
    expect(segments.map((segment) => segment.kind).sort()).toEqual(['arc', 'line']);
  });

  it('keeps an area’s key when only the dimensions change', () => {
    const small = regionsOf(rectangle('a', 0, 0, 10, 10), rectangle('b', 20, 0, 30, 10));
    const large = regionsOf(rectangle('a', 0, 0, 15, 12), rectangle('b', 40, 0, 55, 10));
    expect(small.map((region) => region.key).sort()).toEqual(
      large.map((region) => region.key).sort(),
    );
  });

  it('finds nothing in an open chain', () => {
    const regions = regionsOf([
      { kind: 'point', id: 'a', x: 0, y: 0 },
      { kind: 'point', id: 'b', x: 10, y: 0 },
      { kind: 'point', id: 'c', x: 10, y: 10 },
      { kind: 'line', id: 'l0', start: 'a', end: 'b' },
      { kind: 'line', id: 'l1', start: 'b', end: 'c' },
    ]);
    expect(regions).toEqual([]);
  });

  it('nests a hole inside a hole as rings', () => {
    const regions = regionsOf(
      rectangle('a', 0, 0, 30, 30),
      rectangle('b', 5, 5, 25, 25),
      rectangle('c', 10, 10, 20, 20),
    );
    expect(areas(regions)).toEqual([100, 300, 500]);
    expect(regions.filter((region) => region.loops.length === 2)).toHaveLength(2);
  });
});
