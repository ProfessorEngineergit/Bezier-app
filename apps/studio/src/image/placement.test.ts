import { describe, expect, it } from 'vitest';
import {
  type Corner,
  cornerPoint,
  cropCorner,
  cropEdge,
  edgePoint,
  firstPlacement,
  MAX_CROP,
  MIN_SIDE,
  move,
  NO_CROP,
  type Placement,
  placementOf,
  placementParams,
  resizeCorner,
  resizeEdge,
  toLocal,
  toPlane,
  uncrop,
} from './placement.js';

const base: Placement = { x: 10, y: 20, width: 40, height: 20, rotation: 0, crop: NO_CROP };
const turned: Placement = { ...base, rotation: Math.PI / 6 };

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('where a picture is', () => {
  it('maps its own frame to the plane and back, turned or not', () => {
    for (const placement of [base, turned]) {
      const point = { u: 3, v: -4 };
      const back = toLocal(placement, toPlane(placement, point));
      near(back.u, 3);
      near(back.v, -4);
    }
  });

  it('puts the corners where a person sees them, and turns them with the picture', () => {
    expect(cornerPoint(base, 'ne')).toEqual({ u: 30, v: 30 });
    expect(cornerPoint(base, 'sw')).toEqual({ u: -10, v: 10 });
    const a = cornerPoint({ ...base, rotation: Math.PI / 2 }, 'ne');
    near(a.u, 0);
    near(a.v, 40);
    expect(edgePoint(base, 'e')).toEqual({ u: 30, v: 20 });
  });

  it('first stands whole, with its longer side 100 mm, in either orientation', () => {
    expect(firstPlacement(2000, 1000)).toMatchObject({ width: 100, height: 50 });
    expect(firstPlacement(500, 1000)).toMatchObject({ width: 50, height: 100 });
    expect(firstPlacement(3, 1).height).toBeCloseTo(33.333, 2);
  });
});

describe('resizing', () => {
  it('keeps the opposite corner where it was, on every corner', () => {
    const opposite: Record<Corner, Corner> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };
    for (const placement of [base, turned])
      for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
        const before = cornerPoint(placement, opposite[corner]);
        const pointer = toPlane(placement, {
          u: (corner.includes('e') ? 1 : -1) * 33,
          v: (corner.includes('n') ? 1 : -1) * 17,
        });
        const after = resizeCorner(placement, corner, pointer, false);
        const kept = cornerPoint(after, opposite[corner]);
        near(kept.u, before.u);
        near(kept.v, before.v);
        const moved = cornerPoint(after, corner);
        near(moved.u, pointer.u);
        near(moved.v, pointer.v);
      }
  });

  it('keeps the proportions when asked, whichever way the pointer is pulled', () => {
    const wide = resizeCorner(base, 'ne', { u: 90, v: 31 }, true);
    near(wide.width / wide.height, 2);
    const tall = resizeCorner(base, 'ne', { u: 31, v: 90 }, true);
    near(tall.width / tall.height, 2);
    expect(tall.height).toBeGreaterThan(wide.height);
  });

  it('stops at the smallest size when pulled past the opposite corner', () => {
    const past = resizeCorner(base, 'ne', { u: -500, v: -500 }, false);
    expect(past.width).toBe(MIN_SIDE);
    expect(past.height).toBe(MIN_SIDE);
    const kept = resizeCorner(base, 'ne', { u: -500, v: -500 }, true);
    expect(Math.min(kept.width, kept.height)).toBeGreaterThanOrEqual(MIN_SIDE - 1e-9);
    near(kept.width / kept.height, 2);
  });

  it('stretches one axis from a side and holds the far side', () => {
    const stretched = resizeEdge(base, 'e', { u: 70, v: 999 });
    expect(stretched.height).toBe(20);
    near(stretched.width, 70 - -10);
    near(edgePoint(stretched, 'w').u, -10);
    const taller = resizeEdge(turned, 'n', toPlane(turned, { u: 0, v: 25 }));
    near(taller.height, 10 + 25);
    near(taller.width, 40);
  });

  it('moves without changing size', () => {
    expect(move(base, 5, -5)).toMatchObject({ x: 15, y: 15, width: 40, height: 20 });
  });
});

describe('cropping', () => {
  it('takes a part off one side and leaves the rest of the picture where it was', () => {
    // The left edge is at u = -10; pointing at u = 0 crops 10 mm of 40.
    const cropped = cropEdge(base, 'w', { u: 0, v: 20 });
    near(cropped.width, 30);
    near(cropped.crop.left, 0.25);
    near(edgePoint(cropped, 'e').u, 30);
    near(edgePoint(cropped, 'w').u, 0);
    // Pointing where the edge already is crops nothing.
    expect(cropEdge(base, 'w', { u: -10, v: 20 }).crop.left).toBe(0);
  });

  it('crops on every side, turned or not, with the opposite side not moving', () => {
    for (const placement of [base, turned])
      for (const edge of ['n', 'e', 's', 'w'] as const) {
        const opposite = { n: 's', e: 'w', s: 'n', w: 'e' }[edge] as 'n' | 'e' | 's' | 'w';
        const before = edgePoint(placement, opposite);
        const inward = toPlane(placement, {
          u: edge === 'e' ? 10 : edge === 'w' ? -10 : 0,
          v: edge === 'n' ? 5 : edge === 's' ? -5 : 0,
        });
        const after = cropEdge(placement, edge, inward);
        const kept = edgePoint(after, opposite);
        near(kept.u, before.u);
        near(kept.v, before.v);
        const side = { n: 'top', e: 'right', s: 'bottom', w: 'left' }[edge] as keyof typeof NO_CROP;
        expect(after.crop[side]).toBeGreaterThan(0);
      }
  });

  it('keeps the scale: what is left of the picture is as large as it was', () => {
    const once = cropEdge(base, 'e', { u: 10, v: 20 });
    // 40 mm wide shown, 20 mm taken from the right (a half of the whole).
    near(once.crop.right, 0.5);
    const twice = cropEdge(once, 'w', { u: 0, v: 20 });
    // Scale is 40 mm per whole picture: the left crop of 10 mm is a quarter.
    near(twice.crop.left, 0.25);
    near(twice.width * 1, 40 * (1 - 0.5 - 0.25));
  });

  it('can bring back what was cropped, and not more than the whole picture', () => {
    const cropped = cropEdge(base, 'w', { u: 0, v: 20 });
    const back = cropEdge(cropped, 'w', { u: -500, v: 20 });
    near(back.crop.left, 0);
    near(back.width, 40);
    near(back.x, 10);
  });

  it('never takes the whole of an axis away', () => {
    const almost = cropEdge(base, 'e', { u: -500, v: 20 });
    expect(almost.crop.right).toBeLessThanOrEqual(MAX_CROP + 1e-9);
    expect(almost.width).toBeGreaterThanOrEqual(MIN_SIDE - 1e-9);
    const both = cropEdge(almost, 'w', { u: 500, v: 20 });
    expect(both.crop.left + both.crop.right).toBeLessThan(1);
    expect(both.width).toBeGreaterThanOrEqual(MIN_SIDE - 1e-9);
  });

  it('crops two sides from a corner', () => {
    const cropped = cropCorner(base, 'nw', { u: 0, v: 25 });
    near(cropped.crop.left, 0.25);
    near(cropped.crop.top, 0.25);
    near(cornerPoint(cropped, 'se').u, cornerPoint(base, 'se').u);
    near(cornerPoint(cropped, 'se').v, cornerPoint(base, 'se').v);
  });
});

describe('bringing the whole picture back', () => {
  it('restores the size and the place of what was cropped, turned or not', () => {
    for (const placement of [base, turned]) {
      const cropped = cropCorner(
        cropEdge(placement, 'e', toPlane(placement, { u: 5, v: 0 })),
        'sw',
        toPlane(placement, { u: -12, v: -4 }),
      );
      const whole = uncrop(cropped);
      near(whole.width, placement.width);
      near(whole.height, placement.height);
      near(whole.x, placement.x);
      near(whole.y, placement.y);
      expect(whole.crop).toEqual(NO_CROP);
    }
  });
});

describe('what is saved', () => {
  it('round-trips through the parameters, rotation in degrees as the feature keeps it', () => {
    const params = placementParams(turned);
    near(params.rotation ?? 0, 30);
    const back = placementOf(params);
    near(back.rotation, Math.PI / 6);
    expect(back).toMatchObject({ x: 10, y: 20, width: 40, height: 20 });
  });

  it('reads a document that does not have the numbers as a picture at the origin', () => {
    expect(placementOf({})).toMatchObject({ x: 0, y: 0, width: 100, height: 100, rotation: 0 });
    expect(placementOf({ width: 'wide' }).width).toBe(100);
  });
});
