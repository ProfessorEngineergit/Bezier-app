import type { ProfilePoint, ProfileSegment } from '@bezier/kernel';
import { describe, expect, it } from 'vitest';
import { flankAngle, gearCircles, gearOutline } from './gear-profile.js';

const ALPHA = (20 * Math.PI) / 180;

const ends = (segment: ProfileSegment): [ProfilePoint, ProfilePoint] => {
  if (segment.kind === 'line' || segment.kind === 'arc') return [segment.start, segment.end];
  if (segment.kind === 'spline') {
    return [segment.poles[0] as ProfilePoint, segment.poles.at(-1) as ProfilePoint];
  }
  throw new Error(`no ${segment.kind} in a gear`);
};

describe('the gear outline', () => {
  it('has the ISO circles', () => {
    const circles = gearCircles(20, 2, ALPHA);
    expect(circles.pitch).toBeCloseTo(20);
    expect(circles.tip).toBeCloseTo(22);
    expect(circles.root).toBeCloseTo(17.5);
    expect(circles.base).toBeCloseTo(18.794, 3);
  });

  it('makes a tooth half the circular pitch wide on the pitch circle', () => {
    const { base, pitch } = gearCircles(20, 2, ALPHA);
    const width = 2 * flankAngle(20, ALPHA, base, pitch) * pitch;
    expect(width).toBeCloseTo((Math.PI * 2) / 2);
  });

  for (const teeth of [8, 12, 20, 41, 90]) {
    it(`closes without a gap with ${String(teeth)} teeth`, () => {
      const segments = gearOutline(teeth, 1.5, ALPHA);
      segments.forEach((segment, index) => {
        const [, end] = ends(segment);
        const [start] = ends(segments[(index + 1) % segments.length] as ProfileSegment);
        expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(1e-9);
      });
    });
  }

  it('stays between the root and the tip', () => {
    const { root, tip } = gearCircles(12, 3, ALPHA);
    for (const segment of gearOutline(12, 3, ALPHA)) {
      for (const point of ends(segment)) {
        const radius = Math.hypot(point.x, point.y);
        expect(radius).toBeGreaterThan(root - 1e-9);
        expect(radius).toBeLessThan(tip + 1e-9);
      }
    }
  });

  it('follows the involute between the sampled ends of a flank', () => {
    const { base, tip, root } = gearCircles(30, 2, ALPHA);
    const spline = gearOutline(30, 2, ALPHA).find((segment) => segment.kind === 'spline');
    if (spline?.kind !== 'spline') throw new Error('no flank');
    const [a, b, c, d] = spline.poles as [ProfilePoint, ProfilePoint, ProfilePoint, ProfilePoint];
    const point = (t: number, key: 'x' | 'y') => {
      const s = 1 - t;
      return (
        s * s * s * a[key] + 3 * s * s * t * b[key] + 3 * s * t * t * c[key] + t * t * t * d[key]
      );
    };
    const middle = { x: point(0.5, 'x'), y: point(0.5, 'y') };
    const radius = Math.hypot(middle.x, middle.y);
    const angle = Math.abs(Math.atan2(middle.y, middle.x));
    expect(radius).toBeGreaterThan(Math.max(base, root));
    expect(radius).toBeLessThan(tip);
    expect(Math.abs(angle - flankAngle(30, ALPHA, base, radius)) * radius).toBeLessThan(0.01);
  });
});
