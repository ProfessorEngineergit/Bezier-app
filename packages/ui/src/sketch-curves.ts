/** Exact circle/arc construction and curve hit-testing for sketch tools. */

import { sampleEllipse, sampleSpline } from '@bezier/core';
import type { Sketch, SketchArc, SketchCircle, SketchId, SketchPrimitive } from '@bezier/solver';
import { nextSketchId } from './sketch-id.js';
import { ensurePoint, type Point2D, positionOf } from './sketch-tools.js';

const FULL_TURN = Math.PI * 2;

/** Add a circle from an existing center point and a circumference click. */
export function circleFromCenter(sketch: Sketch, center: SketchId, edge: Point2D): Sketch {
  const at = positionOf(sketch, center);
  if (at === null) return sketch;
  const radius = Math.hypot(edge.u - at.u, edge.v - at.v);
  if (radius < 1e-6) return sketch;
  const circle: SketchCircle = {
    kind: 'circle',
    id: nextSketchId(sketch, 'o'),
    center,
    radius,
  };
  return { primitives: [...sketch.primitives, circle], constraints: sketch.constraints };
}

/**
 * Add the unique circular arc through two endpoints and a curve-position click. The endpoint order
 * records which of the two possible sweeps was selected.
 */
export function arcThrough(sketch: Sketch, start: SketchId, end: SketchId, curve: Point2D): Sketch {
  const a = positionOf(sketch, start);
  const b = positionOf(sketch, end);
  if (a === null || b === null || start === end) return sketch;
  const center = circumcenter(a, b, curve);
  if (center === null) return sketch;
  const centerStep = ensurePoint(sketch, center, 1e-7);
  const startAngle = angle(center, a);
  const endAngle = angle(center, b);
  const curveAngle = angle(center, curve);
  const forward = positiveAngle(curveAngle - startAngle) <= positiveAngle(endAngle - startAngle);
  const arc: SketchArc = {
    kind: 'arc',
    id: nextSketchId(centerStep.sketch, 'a'),
    center: centerStep.id,
    start: forward ? start : end,
    end: forward ? end : start,
  };
  return {
    primitives: [...centerStep.sketch.primitives, arc],
    constraints: centerStep.sketch.constraints,
  };
}

/** Replace a circle radius without involving the unfinished solver. */
export function setCircleRadius(sketch: Sketch, id: SketchId, radius: number): Sketch {
  if (!(radius > 0)) return sketch;
  return {
    ...sketch,
    primitives: sketch.primitives.map((primitive) =>
      primitive.kind === 'circle' && primitive.id === id ? { ...primitive, radius } : primitive,
    ),
  };
}

/** Sample one stored counter-clockwise arc for display, fill, and hit-testing. */
export function sampleArc(sketch: Sketch, arc: SketchArc, segmentCount = 48): readonly Point2D[] {
  const center = positionOf(sketch, arc.center);
  const start = positionOf(sketch, arc.start);
  const end = positionOf(sketch, arc.end);
  if (center === null || start === null || end === null) return [];
  const radius = Math.hypot(start.u - center.u, start.v - center.v);
  if (radius < 1e-9) return [];
  const from = angle(center, start);
  const sweep = positiveAngle(angle(center, end) - from);
  const points: Point2D[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const at = from + sweep * (index / segmentCount);
    points.push({ u: center.u + Math.cos(at) * radius, v: center.v + Math.sin(at) * radius });
  }
  return points;
}

/** Sample a circle densely enough that its viewport ribbon has no visible corners. */
export function sampleCircle(
  sketch: Sketch,
  circle: SketchCircle,
  segmentCount = 96,
): readonly Point2D[] {
  const center = positionOf(sketch, circle.center);
  if (center === null || !(circle.radius > 0)) return [];
  const points: Point2D[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const at = FULL_TURN * (index / segmentCount);
    points.push({
      u: center.u + Math.cos(at) * circle.radius,
      v: center.v + Math.sin(at) * circle.radius,
    });
  }
  return points;
}

export interface CurveHit {
  id: SketchId;
  distance: number;
}

/**
 * Points along any sketch curve (circle, arc, spline, ellipse). Empty for lines, points and curves
 * with missing points.
 */
export function sampleCurve(
  sketch: Sketch,
  primitive: SketchPrimitive,
  count = 96,
): readonly Point2D[] {
  const at = (id: SketchId) => {
    const p = positionOf(sketch, id);
    return p === null ? null : { x: p.u, y: p.v };
  };
  const toUV = (p: { x: number; y: number }) => ({ u: p.x, v: p.y });
  if (primitive.kind === 'circle') return sampleCircle(sketch, primitive, count);
  if (primitive.kind === 'arc') return sampleArc(sketch, primitive, Math.ceil((count * 2) / 3));
  if (primitive.kind === 'spline') {
    const through = primitive.points.map(at);
    if (through.some((p) => p === null)) return [];
    return sampleSpline(through as { x: number; y: number }[], primitive.closed === true).map(toUV);
  }
  if (primitive.kind === 'ellipse') {
    const center = at(primitive.center);
    const vertex = at(primitive.vertex);
    if (center === null || vertex === null) return [];
    return sampleEllipse(center, vertex, primitive.minor, count).map(toUV);
  }
  return [];
}

/** Nearest ordinary curve under a plane point: circle, arc, spline or ellipse. */
export function curveNear(sketch: Sketch, at: Point2D, within: number): CurveHit | null {
  let best: CurveHit | null = null;
  for (const primitive of sketch.primitives) {
    const sampled = sampleCurve(sketch, primitive);
    for (let index = 0; index + 1 < sampled.length; index += 1) {
      const start = sampled[index];
      const end = sampled[index + 1];
      if (start === undefined || end === undefined) continue;
      const distance = segmentDistance(at, start, end);
      if (distance <= within && (best === null || distance < best.distance)) {
        best = { id: primitive.id, distance };
      }
    }
  }
  return best;
}

/** Circle through three non-collinear points. */
function circumcenter(a: Point2D, b: Point2D, c: Point2D): Point2D | null {
  const determinant = 2 * (a.u * (b.v - c.v) + b.u * (c.v - a.v) + c.u * (a.v - b.v));
  if (Math.abs(determinant) < 1e-9) return null;
  const aa = a.u * a.u + a.v * a.v;
  const bb = b.u * b.u + b.v * b.v;
  const cc = c.u * c.u + c.v * c.v;
  return {
    u: (aa * (b.v - c.v) + bb * (c.v - a.v) + cc * (a.v - b.v)) / determinant,
    v: (aa * (c.u - b.u) + bb * (a.u - c.u) + cc * (b.u - a.u)) / determinant,
  };
}

function angle(center: Point2D, point: Point2D): number {
  return Math.atan2(point.v - center.v, point.u - center.u);
}

function positiveAngle(value: number): number {
  return ((value % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function segmentDistance(point: Point2D, start: Point2D, end: Point2D): number {
  const du = end.u - start.u;
  const dv = end.v - start.v;
  const lengthSquared = du * du + dv * dv;
  if (lengthSquared < 1e-12) return Math.hypot(point.u - start.u, point.v - start.v);
  const t = Math.max(
    0,
    Math.min(1, ((point.u - start.u) * du + (point.v - start.v) * dv) / lengthSquared),
  );
  return Math.hypot(point.u - (start.u + du * t), point.v - (start.v + dv * t));
}
