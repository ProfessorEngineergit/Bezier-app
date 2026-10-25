/** Screen-independent sampling of exact sketch curves for the raster overlay. */

import { sampleEllipse, sampleSpline } from '@bezier/core';
import type {
  SketchArc,
  SketchCircle,
  SketchEllipse,
  SketchId,
  SketchPoint,
  SketchSpline,
} from '@bezier/solver';

export interface Point2Like {
  u: number;
  v: number;
}

export function curvePoints(
  curve: SketchArc | SketchCircle | SketchSpline | SketchEllipse,
  points: ReadonlyMap<SketchId, SketchPoint>,
): readonly Point2Like[] {
  if (curve.kind === 'spline') {
    const through = curve.points.map((id) => points.get(id));
    if (through.some((p) => p === undefined)) return [];
    return sampleSpline(through as SketchPoint[], curve.closed === true).map(toUV);
  }
  if (curve.kind === 'ellipse') {
    const center = points.get(curve.center);
    const vertex = points.get(curve.vertex);
    if (center === undefined || vertex === undefined || !(curve.minor > 0)) return [];
    return sampleEllipse(center, vertex, curve.minor).map(toUV);
  }
  return curve.kind === 'circle' ? circlePoints(curve, points) : arcPoints(curve, points);
}

function toUV(p: { x: number; y: number }): Point2Like {
  return { u: p.x, v: p.y };
}

function circlePoints(
  circle: SketchCircle,
  points: ReadonlyMap<SketchId, SketchPoint>,
): readonly Point2Like[] {
  const center = points.get(circle.center);
  if (center === undefined || !(circle.radius > 0)) return [];
  const sampled: Point2Like[] = [];
  for (let index = 0; index <= 96; index += 1) {
    const angle = Math.PI * 2 * (index / 96);
    sampled.push({
      u: center.x + Math.cos(angle) * circle.radius,
      v: center.y + Math.sin(angle) * circle.radius,
    });
  }
  return sampled;
}

function arcPoints(
  arc: SketchArc,
  points: ReadonlyMap<SketchId, SketchPoint>,
): readonly Point2Like[] {
  const center = points.get(arc.center);
  const start = points.get(arc.start);
  const end = points.get(arc.end);
  if (center === undefined || start === undefined || end === undefined) return [];
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  if (radius < 1e-9) return [];
  const from = Math.atan2(start.y - center.y, start.x - center.x);
  const to = Math.atan2(end.y - center.y, end.x - center.x);
  const full = Math.PI * 2;
  const sweep = (((to - from) % full) + full) % full;
  const sampled: Point2Like[] = [];
  for (let index = 0; index <= 64; index += 1) {
    const angle = from + sweep * (index / 64);
    sampled.push({
      u: center.x + Math.cos(angle) * radius,
      v: center.y + Math.sin(angle) * radius,
    });
  }
  return sampled;
}
