/**
 * Trim: removes the piece of a line, arc or circle under the click, between the nearest crossings
 * with other elements. Only the clicked element changes, and only that piece; an element with no
 * crossings is removed entirely. New ends are constrained onto the cutting element so the sketch
 * stays connected. Arcs and circles cut and are cut like lines (audit F-045).
 */
import type { Sketch, SketchConstraint, SketchId, SketchPrimitive } from '@bezier/solver';
import { curveNear } from './sketch-curves.js';
import { namedBy, nextSketchId, pointsOf } from './sketch-id.js';
import { connect, ensurePoint, lineNear, type Point2D, positionOf } from './sketch-tools.js';

const TAU = Math.PI * 2;

/** An element as geometry: a segment, or a counter-clockwise circle or arc. */
type Shape =
  | { kind: 'line'; a: Point2D; b: Point2D }
  | { kind: 'round'; c: Point2D; r: number; from: number; sweep: number; closed: boolean };

interface Cut {
  t: number;
  at: Point2D;
  by: SketchId;
}

const angleOf = (c: Point2D, p: Point2D) => Math.atan2(p.v - c.v, p.u - c.u);
const ccw = (angle: number) => ((angle % TAU) + TAU) % TAU;

function shapeOf(sketch: Sketch, primitive: SketchPrimitive): Shape | null {
  if (primitive.kind === 'line') {
    const a = positionOf(sketch, primitive.start);
    const b = positionOf(sketch, primitive.end);
    return a === null || b === null ? null : { kind: 'line', a, b };
  }
  if (primitive.kind === 'circle') {
    const c = positionOf(sketch, primitive.center);
    return c === null
      ? null
      : { kind: 'round', c, r: primitive.radius, from: 0, sweep: TAU, closed: true };
  }
  if (primitive.kind === 'arc') {
    const c = positionOf(sketch, primitive.center);
    const s = positionOf(sketch, primitive.start);
    const e = positionOf(sketch, primitive.end);
    if (c === null || s === null || e === null) return null;
    const from = angleOf(c, s);
    const sweep = ccw(angleOf(c, e) - from) || TAU;
    return { kind: 'round', c, r: Math.hypot(s.u - c.u, s.v - c.v), from, sweep, closed: false };
  }
  return null;
}

/** Parameter of a point along a shape, 0 to 1; null if it is outside the arc's span. */
function paramOf(shape: Shape, p: Point2D): number | null {
  if (shape.kind === 'line') {
    const du = shape.b.u - shape.a.u;
    const dv = shape.b.v - shape.a.v;
    return ((p.u - shape.a.u) * du + (p.v - shape.a.v) * dv) / (du * du + dv * dv);
  }
  const along = ccw(angleOf(shape.c, p) - shape.from);
  if (along <= shape.sweep + 1e-9) return along / shape.sweep;
  return along >= TAU - 1e-9 ? 0 : null;
}

function pointAt(shape: Shape, t: number): Point2D {
  if (shape.kind === 'line')
    return {
      u: shape.a.u + (shape.b.u - shape.a.u) * t,
      v: shape.a.v + (shape.b.v - shape.a.v) * t,
    };
  const angle = shape.from + shape.sweep * t;
  return { u: shape.c.u + shape.r * Math.cos(angle), v: shape.c.v + shape.r * Math.sin(angle) };
}

/** Intersection points of two shapes, each lying on both. */
function crossings(a: Shape, b: Shape): Point2D[] {
  let found: Point2D[] = [];
  if (a.kind === 'line' && b.kind === 'line') {
    const ru = a.b.u - a.a.u;
    const rv = a.b.v - a.a.v;
    const su = b.b.u - b.a.u;
    const sv = b.b.v - b.a.v;
    const d = ru * sv - rv * su;
    if (Math.abs(d) < 1e-12) return [];
    const t = ((b.a.u - a.a.u) * sv - (b.a.v - a.a.v) * su) / d;
    found = [pointAt(a, t)];
  } else if (a.kind === 'line' || b.kind === 'line') {
    const line = (a.kind === 'line' ? a : b) as Extract<Shape, { kind: 'line' }>;
    const round = (a.kind === 'round' ? a : b) as Extract<Shape, { kind: 'round' }>;
    const du = line.b.u - line.a.u;
    const dv = line.b.v - line.a.v;
    const fu = line.a.u - round.c.u;
    const fv = line.a.v - round.c.v;
    const qa = du * du + dv * dv;
    const qb = 2 * (fu * du + fv * dv);
    const qc = fu * fu + fv * fv - round.r * round.r;
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return [];
    const root = Math.sqrt(disc);
    found = [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)].map((t) => pointAt(line, t));
  } else if (a.kind === 'round' && b.kind === 'round') {
    const du = b.c.u - a.c.u;
    const dv = b.c.v - a.c.v;
    const d = Math.hypot(du, dv);
    if (d < 1e-12 || d > a.r + b.r || d < Math.abs(a.r - b.r)) return [];
    const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, a.r * a.r - along * along));
    const mu = a.c.u + (du * along) / d;
    const mv = a.c.v + (dv * along) / d;
    found = [
      { u: mu + (h * dv) / d, v: mv - (h * du) / d },
      { u: mu - (h * dv) / d, v: mv + (h * du) / d },
    ];
  }
  const on = (shape: Shape, p: Point2D) => {
    const t = paramOf(shape, p);
    return t !== null && t >= -1e-9 && t <= 1 + 1e-9;
  };
  return found.filter((p) => on(a, p) && on(b, p));
}

/** The element under the click (the nearer of line and curve) and its shape. */
function targetAt(sketch: Sketch, at: Point2D, within: number | undefined) {
  const line = lineNear(sketch, at, within);
  const curve = within === undefined ? null : curveNear(sketch, at, within);
  const id =
    line === null || (curve !== null && curve.distance < line.distance) ? curve?.id : line.id;
  const primitive = sketch.primitives.find((p) => p.id === id);
  if (primitive === undefined) return null;
  const shape = shapeOf(sketch, primitive);
  return shape === null ? null : { primitive, shape };
}

/** Removes the part of a line, arc or circle under the click, bounded by its nearest crossings. */
export function trimAt(sketch: Sketch, at: Point2D, within?: number): Sketch {
  const target = targetAt(sketch, at, within);
  if (target === null) return sketch;
  const { primitive, shape } = target;
  const click = paramOf(shape, at) ?? 0;

  const cuts: Cut[] = [];
  for (const other of sketch.primitives) {
    if (other.id === primitive.id || other.kind === 'point') continue;
    if ('construction' in other && other.construction === true) continue;
    const cutter = shapeOf(sketch, other);
    if (cutter === null) continue;
    for (const p of crossings(shape, cutter)) {
      const t = paramOf(shape, p);
      // A crossing at a line's own end bounds nothing; on a full circle every point counts.
      if (t === null || (!(shape.kind === 'round' && shape.closed) && (t < 1e-9 || t > 1 - 1e-9)))
        continue;
      cuts.push({ t, at: p, by: other.id });
    }
  }
  cuts.sort((x, y) => x.t - y.t);
  const before = [...cuts].reverse().find((cut) => cut.t < click);
  const after = cuts.find((cut) => cut.t > click);

  let next: Sketch = {
    primitives: sketch.primitives.filter((p) => p.id !== primitive.id),
    constraints: sketch.constraints.filter((c) => !namedBy(c).includes(primitive.id)),
  };
  const ends = pointsOf(primitive);
  const end = (cut: Cut): SketchId => {
    const placed = ensurePoint(next, cut.at, 1e-7);
    next = placed.sketch;
    if (!placed.joined) next = holdOn(next, placed.id, cut.by);
    return placed.id;
  };

  // Create each new end before the piece using it: `end` updates `next`.
  if (primitive.kind === 'line') {
    if (before !== undefined) {
      const stop = end(before);
      next = connect(next, primitive.start, stop);
    }
    if (after !== undefined) {
      const start = end(after);
      next = connect(next, start, primitive.end);
    }
  } else if (primitive.kind === 'arc') {
    if (before !== undefined) {
      const stop = end(before);
      next = arc(next, primitive.center, primitive.start, stop);
    }
    if (after !== undefined) {
      const start = end(after);
      next = arc(next, primitive.center, start, primitive.end);
    }
  } else if (primitive.kind === 'circle' && cuts.length >= 2) {
    // The long way round: from the crossing after the click to the one before it.
    const start = end(after ?? (cuts[0] as Cut));
    const stop = end(before ?? (cuts[cuts.length - 1] as Cut));
    next = arc(next, primitive.center, start, stop);
  }
  return withoutOrphanPoints(next, new Set(ends.filter((id) => id !== centerOf(primitive))));
}

function centerOf(primitive: SketchPrimitive): SketchId | undefined {
  return primitive.kind === 'arc' || primitive.kind === 'circle' ? primitive.center : undefined;
}

function arc(sketch: Sketch, center: SketchId, start: SketchId, end: SketchId): Sketch {
  if (start === end) return sketch;
  return {
    primitives: [
      ...sketch.primitives,
      { kind: 'arc', id: nextSketchId(sketch, 'a'), center, start, end },
    ],
    constraints: sketch.constraints,
  };
}

/** A new end constrained onto the element that cut it. */
function holdOn(sketch: Sketch, point: SketchId, on: SketchId): Sketch {
  const constraint: SketchConstraint = {
    kind: 'pointOn',
    id: nextSketchId(sketch, 'c'),
    point,
    on,
  };
  return { primitives: sketch.primitives, constraints: [...sketch.constraints, constraint] };
}

/**
 * Removes points of the trimmed element that nothing references any more. Standalone points and
 * spline points are kept.
 */
function withoutOrphanPoints(sketch: Sketch, candidates: ReadonlySet<SketchId>): Sketch {
  const used = new Set<SketchId>();
  for (const primitive of sketch.primitives)
    if (primitive.kind !== 'point') for (const id of pointsOf(primitive)) used.add(id);
  for (const constraint of sketch.constraints) for (const id of namedBy(constraint)) used.add(id);
  return {
    primitives: sketch.primitives.filter(
      (primitive) =>
        primitive.kind !== 'point' || !candidates.has(primitive.id) || used.has(primitive.id),
    ),
    constraints: sketch.constraints,
  };
}
