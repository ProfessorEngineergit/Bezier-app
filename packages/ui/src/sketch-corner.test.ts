import { drawnGeometry, sketchRegions } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { roundCorner } from './sketch-corner.js';

/** A 20 × 10 rectangle, corners p0 (0,0) p1 (20,0) p2 (20,10) p3 (0,10). */
function rectangle(): Sketch {
  const at = [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
  ] as const;
  return {
    primitives: [
      ...at.map(([x, y], i) => ({ kind: 'point' as const, id: `p${i}`, x, y })),
      ...at.map((_, i) => ({
        kind: 'line' as const,
        id: `l${i}`,
        start: `p${i}`,
        end: `p${(i + 1) % 4}`,
      })),
    ],
    constraints: [
      { kind: 'horizontal', id: 'h0', line: 'l0' },
      { kind: 'lock', id: 'k1', point: 'p1', x: 20, y: 0 },
    ],
  };
}

const point = (sketch: Sketch, id: string) => sketch.primitives.find((p) => p.id === id);

describe('rounding a sketch corner', () => {
  it('fillets with a tangent arc and keeps the outline closed', () => {
    const result = roundCorner(rectangle(), ['l0', 'l1'], 'fillet', 3);
    if (!result.ok) throw new Error(result.message);
    const arc = result.sketch.primitives.find((p) => p.kind === 'arc');
    if (arc?.kind !== 'arc') throw new Error('no arc');
    expect(point(result.sketch, arc.center)).toMatchObject({
      x: expect.closeTo(17),
      y: expect.closeTo(3),
    });
    expect(point(result.sketch, arc.start)).toMatchObject({
      x: expect.closeTo(17),
      y: expect.closeTo(0),
    });
    expect(point(result.sketch, arc.end)).toMatchObject({
      x: expect.closeTo(20),
      y: expect.closeTo(3),
    });
    expect(point(result.sketch, 'p1')).toBeUndefined();
    // The lock on the corner went with it; the horizontal stayed.
    expect(result.sketch.constraints.map((c) => c.id)).toEqual(['h0']);
    const areas = sketchRegions(result.sketch, drawnGeometry(result.sketch));
    expect(areas).toHaveLength(1);
  });

  it('chamfers with a straight line', () => {
    const result = roundCorner(rectangle(), ['l1', 'l0'], 'chamfer', 2);
    if (!result.ok) throw new Error(result.message);
    expect(result.sketch.primitives.filter((p) => p.kind === 'line')).toHaveLength(5);
    expect(sketchRegions(result.sketch, drawnGeometry(result.sketch))).toHaveLength(1);
  });

  it('says why when it cannot', () => {
    expect(roundCorner(rectangle(), ['l0', 'l2'], 'fillet', 1)).toEqual({
      ok: false,
      message: 'Those two lines do not meet.',
    });
    expect(roundCorner(rectangle(), ['l0', 'l1'], 'fillet', 12).ok).toBe(false);
    expect(roundCorner(rectangle(), ['l0'], 'fillet', 1).ok).toBe(false);
  });
});
