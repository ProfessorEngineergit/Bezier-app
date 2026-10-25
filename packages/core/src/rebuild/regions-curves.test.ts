import type { Sketch, SketchPrimitive } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { drawnGeometry, sketchRegions } from './regions.js';

const p = (id: string, x: number, y: number): SketchPrimitive => ({ kind: 'point', id, x, y });
const regionsOf = (primitives: SketchPrimitive[]) => {
  const sketch: Sketch = { primitives, constraints: [] };
  return sketchRegions(sketch, drawnGeometry(sketch));
};

describe('areas bounded by splines and ellipses', () => {
  it('an ellipse alone is one area, given to the kernel whole', () => {
    const [region, ...rest] = regionsOf([
      p('c', 0, 0),
      p('v', 10, 0),
      { kind: 'ellipse', id: 'e', center: 'c', vertex: 'v', minor: 4 },
    ]);
    expect(rest).toEqual([]);
    expect(region?.loops).toEqual([
      [{ kind: 'ellipse', center: { x: 0, y: 0 }, major: { x: 10, y: 0 }, minor: 4 }],
    ]);
    expect(region?.area).toBeCloseTo(Math.PI * 40, 0);
  });

  it('a closed spline alone is one area', () => {
    const [region, ...rest] = regionsOf([
      p('a', 0, 0),
      p('b', 10, 0),
      p('c', 10, 10),
      p('d', 0, 10),
      { kind: 'spline', id: 's', points: ['a', 'b', 'c', 'd'], closed: true },
    ]);
    expect(rest).toEqual([]);
    expect(region?.loops[0]?.[0]?.kind).toBe('spline');
    expect(region?.area).toBeGreaterThan(80);
  });

  it('a spline closed by a line is one area of two segments', () => {
    const [region] = regionsOf([
      p('a', 0, 0),
      p('m', 5, 6),
      p('b', 10, 0),
      { kind: 'spline', id: 's', points: ['a', 'm', 'b'] },
      { kind: 'line', id: 'l', start: 'b', end: 'a' },
    ]);
    expect(region?.loops[0]?.map((segment) => segment.kind).sort()).toEqual(['line', 'spline']);
  });

  it('a line across an ellipse cuts it into two areas', () => {
    const regions = regionsOf([
      p('c', 0, 0),
      p('v', 10, 0),
      { kind: 'ellipse', id: 'e', center: 'c', vertex: 'v', minor: 4 },
      p('l0', 0, -8),
      p('l1', 0, 8),
      { kind: 'line', id: 'l', start: 'l0', end: 'l1' },
    ]);
    expect(regions).toHaveLength(2);
    for (const region of regions) expect(region.area).toBeCloseTo(Math.PI * 20, 0);
  });

  it('a line across a closed spline cuts it into two areas', () => {
    const regions = regionsOf([
      p('a', -10, 0),
      p('b', 0, -10),
      p('c', 10, 0),
      p('d', 0, 10),
      { kind: 'spline', id: 's', points: ['a', 'b', 'c', 'd'], closed: true },
      p('l0', -15, 1),
      p('l1', 15, 1),
      { kind: 'line', id: 'l', start: 'l0', end: 'l1' },
    ]);
    expect(regions).toHaveLength(2);
  });
});
