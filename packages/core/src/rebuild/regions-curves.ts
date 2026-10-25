/**
 * Sketch elements as parametric curves and their intersections, the first step of finding regions
 * (`regions.ts`).
 */

import type { Point2, Sketch, SketchId } from '@bezier/solver';
import { bezierChainAt, ellipseAt, splinePoles } from './curve-math.js';
import type { SketchGeometry } from './regions.js';

export const TAU = Math.PI * 2;

export type Curve =
  | { kind: 'line'; id: SketchId; a: Point2; b: Point2 }
  | { kind: 'arc'; id: SketchId; center: Point2; radius: number; from: number; sweep: number }
  /** A cubic Bézier chain (`curve-math.ts`), parameterised 0 to 1 over the whole chain. */
  | { kind: 'spline'; id: SketchId; poles: Point2[]; closed: boolean }
  | { kind: 'ellipse'; id: SketchId; center: Point2; major: Point2; minor: number };

/** Whether a curve is closed on its own. */
export function isClosedCurve(curve: Curve): boolean {
  if (curve.kind === 'arc') return curve.sweep >= TAU - 1e-12;
  if (curve.kind === 'spline') return curve.closed;
  return curve.kind === 'ellipse';
}

export function curvesOf(sketch: Sketch, geometry: SketchGeometry): Curve[] {
  const curves: Curve[] = [];
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'point' || primitive.construction === true) continue;
    if (primitive.kind === 'line') {
      const a = geometry.point(primitive.start);
      const b = geometry.point(primitive.end);
      if (a !== null && b !== null && Math.hypot(b.x - a.x, b.y - a.y) > 1e-12) {
        curves.push({ kind: 'line', id: primitive.id, a, b });
      }
    } else if (primitive.kind === 'circle') {
      const center = geometry.point(primitive.center);
      const radius = geometry.radius(primitive.id, primitive.radius);
      if (center !== null && radius > 1e-12) {
        curves.push({ kind: 'arc', id: primitive.id, center, radius, from: 0, sweep: TAU });
      }
    } else if (primitive.kind === 'spline') {
      const through = primitive.points.map((id) => geometry.point(id));
      if (through.some((p) => p === null) || through.length < 2) continue;
      const closed = primitive.closed === true && through.length >= 3;
      const poles = splinePoles(through as Point2[], closed);
      if (poles.length >= 4) curves.push({ kind: 'spline', id: primitive.id, poles, closed });
    } else if (primitive.kind === 'ellipse') {
      const center = geometry.point(primitive.center);
      const vertex = geometry.point(primitive.vertex);
      const minor = geometry.radius(primitive.id, primitive.minor);
      if (center === null || vertex === null || minor <= 1e-12) continue;
      const major = { x: vertex.x - center.x, y: vertex.y - center.y };
      if (Math.hypot(major.x, major.y) <= 1e-12) continue;
      curves.push({ kind: 'ellipse', id: primitive.id, center, major, minor });
    } else {
      const center = geometry.point(primitive.center);
      const start = geometry.point(primitive.start);
      const end = geometry.point(primitive.end);
      if (center === null || start === null || end === null) continue;
      const radius = Math.hypot(start.x - center.x, start.y - center.y);
      if (radius <= 1e-12) continue;
      // Stored counter-clockwise from start to end, as the profile layer reads it.
      const from = Math.atan2(start.y - center.y, start.x - center.x);
      const to = Math.atan2(end.y - center.y, end.x - center.x);
      const sweep = (((to - from) % TAU) + TAU) % TAU || TAU;
      curves.push({ kind: 'arc', id: primitive.id, center, radius, from, sweep });
    }
  }
  return curves;
}

export function ends(curve: Curve): number[] {
  return isClosedCurve(curve) ? [] : [0, 1];
}

export function pointOn(curve: Curve, t: number): Point2 {
  if (curve.kind === 'line') {
    return {
      x: curve.a.x + (curve.b.x - curve.a.x) * t,
      y: curve.a.y + (curve.b.y - curve.a.y) * t,
    };
  }
  if (curve.kind === 'spline')
    return bezierChainAt(curve.poles, ((t % 1) + 1) % 1 || (t >= 1 ? 1 : 0));
  if (curve.kind === 'ellipse') return ellipseAt(curve.center, curve.major, curve.minor, TAU * t);
  const angle = curve.from + curve.sweep * t;
  return {
    x: curve.center.x + curve.radius * Math.cos(angle),
    y: curve.center.y + curve.radius * Math.sin(angle),
  };
}

export function lengthOf(curve: Curve, t0: number, t1: number): number {
  if (curve.kind === 'line')
    return Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y) * (t1 - t0);
  if (curve.kind === 'arc') return curve.radius * curve.sweep * (t1 - t0);
  // Approximated by a fine polyline; only compared against tolerances.
  let length = 0;
  let previous = pointOn(curve, t0);
  for (let k = 1; k <= 64; k += 1) {
    const next = pointOn(curve, t0 + ((t1 - t0) * k) / 64);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  return length;
}

export function extentOf(curves: readonly Curve[]): number {
  let extent = 0;
  for (const curve of curves) {
    if (curve.kind === 'line') {
      extent = Math.max(extent, Math.abs(curve.a.x), Math.abs(curve.a.y));
      extent = Math.max(extent, Math.abs(curve.b.x), Math.abs(curve.b.y));
    } else if (curve.kind === 'spline') {
      for (const p of curve.poles) extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
    } else if (curve.kind === 'ellipse') {
      const reach = Math.hypot(curve.major.x, curve.major.y);
      extent = Math.max(extent, Math.abs(curve.center.x) + reach, Math.abs(curve.center.y) + reach);
    } else {
      extent = Math.max(
        extent,
        Math.abs(curve.center.x) + curve.radius,
        Math.abs(curve.center.y) + curve.radius,
      );
    }
  }
  return Math.max(extent, 1);
}

/** Parameter of a point on an arc, or null when it lies outside the arc's sweep. */
function arcParameter(
  curve: Extract<Curve, { kind: 'arc' }>,
  p: Point2,
  eps: number,
): number | null {
  const angle = Math.atan2(p.y - curve.center.y, p.x - curve.center.x);
  const along = (((angle - curve.from) % TAU) + TAU) % TAU;
  const slack = eps / curve.radius;
  if (curve.sweep >= TAU - 1e-12) return along / TAU;
  if (along <= curve.sweep + slack) return Math.min(1, along / curve.sweep);
  if (along >= TAU - slack) return 0;
  return null;
}

function lineParameter(
  curve: Extract<Curve, { kind: 'line' }>,
  p: Point2,
  eps: number,
): number | null {
  const dx = curve.b.x - curve.a.x;
  const dy = curve.b.y - curve.a.y;
  const length = Math.hypot(dx, dy);
  const t = ((p.x - curve.a.x) * dx + (p.y - curve.a.y) * dy) / (length * length);
  const slack = eps / length;
  if (t < -slack || t > 1 + slack) return null;
  return Math.min(1, Math.max(0, t));
}

/** Intersections of two curves, as a parameter pair per point. */
export function meetings(a: Curve, b: Curve, eps: number): [number, number][] {
  if (a.kind === 'spline' || a.kind === 'ellipse' || b.kind === 'spline' || b.kind === 'ellipse')
    return sampledMeetings(a, b, eps);
  if (a.kind === 'line' && b.kind === 'line') return lineLine(a, b, eps);
  if (a.kind === 'line' && b.kind === 'arc') return lineArc(a, b, eps);
  if (a.kind === 'arc' && b.kind === 'line') {
    return lineArc(b, a, eps).map(([tb, ta]) => [ta, tb]);
  }
  if (a.kind === 'arc' && b.kind === 'arc') return arcArc(a, b, eps);
  return [];
}

function lineLine(
  a: Extract<Curve, { kind: 'line' }>,
  b: Extract<Curve, { kind: 'line' }>,
  eps: number,
): [number, number][] {
  const rx = a.b.x - a.a.x;
  const ry = a.b.y - a.a.y;
  const sx = b.b.x - b.a.x;
  const sy = b.b.y - b.a.y;
  const denominator = rx * sy - ry * sx;
  const qx = b.a.x - a.a.x;
  const qy = b.a.y - a.a.y;
  if (Math.abs(denominator) <= 1e-12 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) {
    // Parallel: collinear lines meet where an end of one lies on the other (often a shared corner).
    const found: [number, number][] = [];
    for (const point of [a.a, a.b, b.a, b.b]) {
      const ta = lineParameter(a, point, eps);
      const tb = lineParameter(b, point, eps);
      if (ta === null || tb === null) continue;
      if (distanceTo(pointOn(a, ta), point) > eps * 10) continue;
      if (distanceTo(pointOn(b, tb), point) > eps * 10) continue;
      found.push([ta, tb]);
    }
    return found;
  }
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  const slackA = eps / Math.hypot(rx, ry);
  const slackB = eps / Math.hypot(sx, sy);
  if (t < -slackA || t > 1 + slackA || u < -slackB || u > 1 + slackB) return [];
  return [[Math.min(1, Math.max(0, t)), Math.min(1, Math.max(0, u))]];
}

function lineArc(
  line: Extract<Curve, { kind: 'line' }>,
  arc: Extract<Curve, { kind: 'arc' }>,
  eps: number,
): [number, number][] {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const fx = line.a.x - arc.center.x;
  const fy = line.a.y - arc.center.y;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (fx * dx + fy * dy);
  const qc = fx * fx + fy * fy - arc.radius * arc.radius;
  let discriminant = qb * qb - 4 * qa * qc;
  // Tangent line: accept the touching point within tolerance.
  const tolerance = 4 * qa * (2 * arc.radius * eps);
  if (discriminant < -tolerance) return [];
  discriminant = Math.max(0, discriminant);
  const root = Math.sqrt(discriminant);
  const found: [number, number][] = [];
  const candidates =
    root === 0 ? [-qb / (2 * qa)] : [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)];
  for (const t of candidates) {
    const slack = eps / Math.sqrt(qa);
    if (t < -slack || t > 1 + slack) continue;
    const clamped = Math.min(1, Math.max(0, t));
    const at = pointOn(line, clamped);
    const u = arcParameter(arc, at, eps);
    if (u !== null) found.push([clamped, u]);
  }
  return found;
}

function arcArc(
  a: Extract<Curve, { kind: 'arc' }>,
  b: Extract<Curve, { kind: 'arc' }>,
  eps: number,
): [number, number][] {
  const dx = b.center.x - a.center.x;
  const dy = b.center.y - a.center.y;
  const d = Math.hypot(dx, dy);
  if (d <= eps) {
    // Concentric: only arcs of the same circle share points, at their ends.
    if (Math.abs(a.radius - b.radius) > eps) return [];
    const found: [number, number][] = [];
    for (const t of ends(a)) {
      const u = arcParameter(b, pointOn(a, t), eps);
      if (u !== null) found.push([t, u]);
    }
    for (const u of ends(b)) {
      const t = arcParameter(a, pointOn(b, u), eps);
      if (t !== null) found.push([t, u]);
    }
    return found;
  }
  if (d > a.radius + b.radius + eps || d < Math.abs(a.radius - b.radius) - eps) return [];
  const along = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, a.radius * a.radius - along * along));
  const mx = a.center.x + (dx * along) / d;
  const my = a.center.y + (dy * along) / d;
  const points =
    height <= eps
      ? [{ x: mx, y: my }]
      : [
          { x: mx + (-dy * height) / d, y: my + (dx * height) / d },
          { x: mx - (-dy * height) / d, y: my - (dx * height) / d },
        ];
  const found: [number, number][] = [];
  for (const point of points) {
    const t = arcParameter(a, point, eps);
    const u = arcParameter(b, point, eps);
    if (t !== null && u !== null) found.push([t, u]);
  }
  return found;
}

function distanceTo(p: Point2, q: Point2): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

// Spline and ellipse intersections: found on fine polylines, then refined on the curves so both
// pieces end at exactly one point and region loops close.

/** Sample parameters, fine enough not to step over crossings. */
function samples(curve: Curve): number[] {
  const count =
    curve.kind === 'line'
      ? 1
      : curve.kind === 'arc'
        ? Math.max(8, Math.ceil((curve.sweep / TAU) * 64))
        : curve.kind === 'spline'
          ? ((curve.poles.length - 1) / 3) * 24
          : 128;
  return Array.from({ length: count + 1 }, (_, k) => k / count);
}

function sampledMeetings(a: Curve, b: Curve, eps: number): [number, number][] {
  const ta = samples(a);
  const tb = samples(b);
  const pa = ta.map((t) => pointOn(a, t));
  const pb = tb.map((t) => pointOn(b, t));
  const found: [number, number][] = [];
  const near = (p: [number, number]) =>
    found.some(([s, t]) => Math.abs(s - p[0]) < 1e-6 && Math.abs(t - p[1]) < 1e-6);
  for (let i = 0; i + 1 < pa.length; i += 1) {
    for (let j = 0; j + 1 < pb.length; j += 1) {
      const hit = segmentCrossing(
        pa[i] as Point2,
        pa[i + 1] as Point2,
        pb[j] as Point2,
        pb[j + 1] as Point2,
      );
      if (hit === null) continue;
      const guess: [number, number] = [
        (ta[i] ?? 0) + ((ta[i + 1] ?? 0) - (ta[i] ?? 0)) * hit[0],
        (tb[j] ?? 0) + ((tb[j + 1] ?? 0) - (tb[j] ?? 0)) * hit[1],
      ];
      const settled = settle(a, b, guess, eps);
      if (settled !== null && !near(settled)) found.push(settled);
    }
  }
  return found;
}

function segmentCrossing(p: Point2, q: Point2, r: Point2, s: Point2): [number, number] | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const ex = s.x - r.x;
  const ey = s.y - r.y;
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) < 1e-18) return null;
  const u = ((r.x - p.x) * ey - (r.y - p.y) * ex) / denominator;
  const v = ((r.x - p.x) * dy - (r.y - p.y) * dx) / denominator;
  const slack = 1e-9;
  if (u < -slack || u > 1 + slack || v < -slack || v > 1 + slack) return null;
  return [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))];
}

/** Newton iteration on A(s) = B(t) from the polyline crossing. Null if it does not converge. */
function settle(
  a: Curve,
  b: Curve,
  [s0, t0]: [number, number],
  eps: number,
): [number, number] | null {
  let s = s0;
  let t = t0;
  const h = 1e-7;
  for (let k = 0; k < 20; k += 1) {
    const pa = pointOn(a, s);
    const pb = pointOn(b, t);
    const fx = pa.x - pb.x;
    const fy = pa.y - pb.y;
    if (Math.hypot(fx, fy) < eps * 1e-3) break;
    const da = pointOn(a, s + h);
    const db = pointOn(b, t + h);
    const ax = (da.x - pa.x) / h;
    const ay = (da.y - pa.y) / h;
    const bx = -(db.x - pb.x) / h;
    const by = -(db.y - pb.y) / h;
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-18) break;
    s -= (fx * by - fy * bx) / det;
    t -= (ax * fy - ay * fx) / det;
  }
  const wrap = (curve: Curve, value: number) =>
    isClosedCurve(curve) ? ((value % 1) + 1) % 1 : value;
  s = wrap(a, s);
  t = wrap(b, t);
  if (s < -1e-9 || s > 1 + 1e-9 || t < -1e-9 || t > 1 + 1e-9) return null;
  const pa = pointOn(a, s);
  const pb = pointOn(b, t);
  if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > Math.max(eps * 100, 1e-6)) return null;
  return [Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, t))];
}
