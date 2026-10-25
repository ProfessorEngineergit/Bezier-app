/**
 * Further sketch shapes: point, regular polygon, slot, 3-point circle, centre arc, tangent arc,
 * ellipse and spline. Pure like `sketch-tools.ts`. Each shape adds the constraints that define it
 * (equal sides on a circle, tangent slot sides, tangent arc), so the solver preserves it.
 */

import type {
  Sketch,
  SketchArc,
  SketchConstraint,
  SketchId,
  SketchPrimitive,
} from '@bezier/solver';
import { nextSketchId } from './sketch-id.js';
import { ensurePoint, type Point2D, positionOf } from './sketch-tools.js';

/** Shape tools and the number of clicks each takes. */
export const SHAPE_CLICKS = {
  point: 1,
  'polygon-3': 2,
  'polygon-5': 2,
  'polygon-6': 2,
  'polygon-8': 2,
  slot: 3,
  'circle-3p': 3,
  'center-arc': 3,
  'tangent-arc': 2,
  ellipse: 3,
} as const;

export type ShapeTool = keyof typeof SHAPE_CLICKS;

export function isShapeTool(tool: string | null): tool is ShapeTool {
  return tool !== null && tool in SHAPE_CLICKS;
}

/**
 * Handles one click with a shape tool. Clicks accumulate until the shape is complete, then it is
 * built and `clicks` resets. `sketch` is null while collecting, or when the clicks give no valid
 * shape (e.g. a zero-length slot), in which case the clicks are dropped.
 */
export function shapeClick(
  tool: ShapeTool,
  sketch: Sketch,
  clicks: readonly Point2D[],
  at: Point2D,
  snap: number,
): { sketch: Sketch | null; clicks: readonly Point2D[]; message?: string } {
  const all = [...clicks, at];
  if (all.length < SHAPE_CLICKS[tool]) {
    // A tangent arc must start at a line end.
    if (tool === 'tangent-arc' && lineEndingAt(sketch, at, snap) === null)
      return { sketch: null, clicks: [], message: 'Start a tangent arc on the end of a line.' };
    return { sketch: null, clicks: all };
  }
  const [a, b, c] = all as [Point2D, Point2D, Point2D];
  const built =
    tool === 'point'
      ? ensurePoint(sketch, a, snap).sketch
      : tool === 'slot'
        ? slotAt(sketch, a, b, c, snap)
        : tool === 'circle-3p'
          ? circleThrough(sketch, a, b, c, snap)
          : tool === 'center-arc'
            ? arcFromCenter(sketch, a, b, c, snap)
            : tool === 'tangent-arc'
              ? tangentArc(sketch, a, b, snap)
              : tool === 'ellipse'
                ? ellipseAt(sketch, a, b, c, snap)
                : polygonAt(sketch, a, b, Number(tool.slice('polygon-'.length)), snap);
  return { sketch: built, clicks: [] };
}

/**
 * A regular polygon from its centre and one corner: corners on a construction circle (which holds
 * the size) and equal sides.
 */
export function polygonAt(
  sketch: Sketch,
  center: Point2D,
  corner: Point2D,
  sides: number,
  snap: number,
): Sketch | null {
  const radius = Math.hypot(corner.u - center.u, corner.v - center.v);
  if (radius < 1e-6 || sides < 3) return null;
  const middle = ensurePoint(sketch, center, snap);
  let next = middle.sketch;
  const circleId = nextSketchId(next, 'o');
  next = add(next, [
    { kind: 'circle', id: circleId, center: middle.id, radius, construction: true },
  ]);
  const start = Math.atan2(corner.v - center.v, corner.u - center.u);
  const corners: SketchId[] = [];
  for (let k = 0; k < sides; k += 1) {
    const turn = start + (k * 2 * Math.PI) / sides;
    // Only the clicked (first) corner may snap to existing geometry.
    const step = ensurePoint(
      next,
      { u: center.u + radius * Math.cos(turn), v: center.v + radius * Math.sin(turn) },
      k === 0 ? snap : 1e-9,
    );
    next = step.sketch;
    corners.push(step.id);
  }
  const lines: SketchId[] = [];
  for (let k = 0; k < sides; k += 1) {
    const id = nextSketchId(next, 'l');
    next = add(next, [
      {
        kind: 'line',
        id,
        start: corners[k] as SketchId,
        end: corners[(k + 1) % sides] as SketchId,
      },
    ]);
    lines.push(id);
  }
  const relations: SketchConstraint[] = [];
  const ids = idsFor(next);
  for (const point of corners)
    relations.push({ kind: 'pointOn', id: ids('on'), point, on: circleId });
  for (let k = 0; k + 1 < sides; k += 1)
    relations.push({
      kind: 'equal',
      id: ids('equal'),
      a: lines[k] as SketchId,
      b: lines[k + 1] as SketchId,
    });
  return { ...next, constraints: [...next.constraints, ...relations] };
}

/**
 * A slot from the centres of its two ends plus a click giving the width: two lines tangent to two
 * equal-radius arcs.
 */
export function slotAt(
  sketch: Sketch,
  a: Point2D,
  b: Point2D,
  edge: Point2D,
  snap: number,
): Sketch | null {
  const length = Math.hypot(b.u - a.u, b.v - a.v);
  if (length < 1e-6) return null;
  const d = { u: (b.u - a.u) / length, v: (b.v - a.v) / length };
  const n = { u: -d.v, v: d.u };
  const radius = Math.abs((edge.u - a.u) * n.u + (edge.v - a.v) * n.v);
  if (radius < 1e-6) return null;
  const off = (p: Point2D, side: number) => ({
    u: p.u + n.u * radius * side,
    v: p.v + n.v * radius * side,
  });
  let next = sketch;
  const point = (at: Point2D, within: number) => {
    const step = ensurePoint(next, at, within);
    next = step.sketch;
    return step.id;
  };
  const ca = point(a, snap);
  const cb = point(b, snap);
  const p1 = point(off(a, 1), 1e-9);
  const p2 = point(off(b, 1), 1e-9);
  const p3 = point(off(b, -1), 1e-9);
  const p4 = point(off(a, -1), 1e-9);
  const top = nextSketchId(next, 'l');
  next = add(next, [{ kind: 'line', id: top, start: p1, end: p2 }]);
  const bottom = nextSketchId(next, 'l');
  next = add(next, [{ kind: 'line', id: bottom, start: p3, end: p4 }]);
  // Arcs run counter-clockwise from start to end, so each end bulges outward.
  const endB = nextSketchId(next, 'a');
  next = add(next, [{ kind: 'arc', id: endB, center: cb, start: p3, end: p2 }]);
  const endA = nextSketchId(next, 'a');
  next = add(next, [{ kind: 'arc', id: endA, center: ca, start: p1, end: p4 }]);
  const ids = idsFor(next);
  return {
    ...next,
    constraints: [
      ...next.constraints,
      { kind: 'tangent', id: ids('tangent'), a: top, b: endA },
      { kind: 'tangent', id: ids('tangent'), a: top, b: endB },
      { kind: 'tangent', id: ids('tangent'), a: bottom, b: endA },
      { kind: 'tangent', id: ids('tangent'), a: bottom, b: endB },
      { kind: 'equal', id: ids('equal'), a: endA, b: endB },
    ],
  };
}

/** A circle through three clicked points. */
export function circleThrough(
  sketch: Sketch,
  a: Point2D,
  b: Point2D,
  c: Point2D,
  snap: number,
): Sketch | null {
  const center = circumcentre(a, b, c);
  if (center === null) return null;
  const middle = ensurePoint(sketch, center, 1e-9);
  // Clicked points that snap to existing points are constrained onto the circle.
  let next = middle.sketch;
  const id = nextSketchId(next, 'o');
  next = add(next, [
    {
      kind: 'circle',
      id,
      center: middle.id,
      radius: Math.hypot(a.u - center.u, a.v - center.v),
    },
  ]);
  const ids = idsFor(next);
  const on: SketchConstraint[] = [];
  for (const clicked of [a, b, c]) {
    const step = ensurePoint(next, clicked, snap);
    if (step.joined) on.push({ kind: 'pointOn', id: ids('on'), point: step.id, on: id });
  }
  return { ...next, constraints: [...next.constraints, ...on] };
}

/**
 * An arc from its centre, its start point, and a third click projected onto the circle as its end.
 * Counter-clockwise from start to end, as arcs are stored.
 */
export function arcFromCenter(
  sketch: Sketch,
  center: Point2D,
  start: Point2D,
  end: Point2D,
  snap: number,
): Sketch | null {
  const radius = Math.hypot(start.u - center.u, start.v - center.v);
  const reach = Math.hypot(end.u - center.u, end.v - center.v);
  if (radius < 1e-6 || reach < 1e-6) return null;
  const onCircle = {
    u: center.u + ((end.u - center.u) / reach) * radius,
    v: center.v + ((end.v - center.v) / reach) * radius,
  };
  let next = sketch;
  const point = (at: Point2D, within: number) => {
    const step = ensurePoint(next, at, within);
    next = step.sketch;
    return step.id;
  };
  const c = point(center, snap);
  const s = point(start, snap);
  const e = point(onCircle, 1e-9);
  if (s === e) return null;
  const arc: SketchArc = { kind: 'arc', id: nextSketchId(next, 'a'), center: c, start: s, end: e };
  return add(next, [arc]);
}

/**
 * An arc starting at a line end, tangent to the line, ending at the clicked point. It bends towards
 * the side of the line the end point is on.
 */
export function tangentArc(
  sketch: Sketch,
  from: Point2D,
  to: Point2D,
  snap: number,
): Sketch | null {
  const leaving = lineEndingAt(sketch, from, snap);
  if (leaving === null) return null;
  const { line, end, other } = leaving;
  const s = positionOf(sketch, end);
  const o = positionOf(sketch, other);
  if (s === null || o === null) return null;
  const run = Math.hypot(s.u - o.u, s.v - o.v);
  if (run < 1e-9) return null;
  const t = { u: (s.u - o.u) / run, v: (s.v - o.v) / run };
  const left = { u: -t.v, v: t.u };
  const w = { u: to.u - s.u, v: to.v - s.v };
  const side = w.u * left.u + w.v * left.v;
  // Straight ahead: infinite radius.
  if (Math.abs(side) < 1e-9) return null;
  const rho = (w.u * w.u + w.v * w.v) / (2 * side);
  const center = { u: s.u + left.u * rho, v: s.v + left.v * rho };
  let next = sketch;
  const c = ensurePoint(next, center, 1e-9);
  next = c.sketch;
  const e = ensurePoint(next, to, snap);
  next = e.sketch;
  if (e.id === end) return null;
  // Bending left runs counter-clockwise from the line end; bending right, the reverse.
  const arc: SketchArc = {
    kind: 'arc',
    id: nextSketchId(next, 'a'),
    center: c.id,
    start: rho > 0 ? end : e.id,
    end: rho > 0 ? e.id : end,
  };
  next = add(next, [arc]);
  const ids = idsFor(next);
  return {
    ...next,
    constraints: [...next.constraints, { kind: 'tangent', id: ids('tangent'), a: line, b: arc.id }],
  };
}

/**
 * An ellipse from its centre, one axis end, and a click beside that axis giving the other radius.
 * The first axis defines the rotation and need not be the major one.
 */
export function ellipseAt(
  sketch: Sketch,
  center: Point2D,
  end: Point2D,
  side: Point2D,
  snap: number,
): Sketch | null {
  const reach = Math.hypot(end.u - center.u, end.v - center.v);
  if (reach < 1e-6) return null;
  const across = Math.abs(
    ((side.u - center.u) * -(end.v - center.v) + (side.v - center.v) * (end.u - center.u)) / reach,
  );
  if (across < 1e-6) return null;
  const middle = ensurePoint(sketch, center, snap);
  const vertex = ensurePoint(middle.sketch, end, snap);
  if (vertex.id === middle.id) return null;
  return add(vertex.sketch, [
    {
      kind: 'ellipse',
      id: nextSketchId(vertex.sketch, 'e'),
      center: middle.id,
      vertex: vertex.id,
      minor: across,
    },
  ]);
}

/**
 * A spline through the clicked points in order, reusing existing points it snaps to (so it can
 * continue from a line end). A closed spline joins the last point back to the first.
 */
export function splineThrough(
  sketch: Sketch,
  clicks: readonly Point2D[],
  closed: boolean,
  snap: number,
): Sketch | null {
  if (clicks.length < (closed ? 3 : 2)) return null;
  let next = sketch;
  const points: SketchId[] = [];
  for (const click of clicks) {
    const step = ensurePoint(next, click, snap);
    next = step.sketch;
    if (points[points.length - 1] !== step.id) points.push(step.id);
  }
  if (points.length < (closed ? 3 : 2)) return null;
  return add(next, [
    {
      kind: 'spline',
      id: nextSketchId(next, 's'),
      points,
      ...(closed ? { closed: true } : {}),
    },
  ]);
}

/** The line with an end within `snap` of `at`: the line, that end and its other end. */
function lineEndingAt(
  sketch: Sketch,
  at: Point2D,
  snap: number,
): { line: SketchId; end: SketchId; other: SketchId } | null {
  let best: { line: SketchId; end: SketchId; other: SketchId; distance: number } | null = null;
  for (const primitive of sketch.primitives) {
    if (primitive.kind !== 'line') continue;
    for (const [end, other] of [
      [primitive.end, primitive.start],
      [primitive.start, primitive.end],
    ] as const) {
      const p = positionOf(sketch, end);
      if (p === null) continue;
      const distance = Math.hypot(p.u - at.u, p.v - at.v);
      if (distance <= snap && (best === null || distance < best.distance))
        best = { line: primitive.id, end, other, distance };
    }
  }
  return best === null ? null : { line: best.line, end: best.end, other: best.other };
}

function circumcentre(a: Point2D, b: Point2D, c: Point2D): Point2D | null {
  const d = 2 * (a.u * (b.v - c.v) + b.u * (c.v - a.v) + c.u * (a.v - b.v));
  if (Math.abs(d) < 1e-9) return null;
  const aa = a.u * a.u + a.v * a.v;
  const bb = b.u * b.u + b.v * b.v;
  const cc = c.u * c.u + c.v * c.v;
  return {
    u: (aa * (b.v - c.v) + bb * (c.v - a.v) + cc * (a.v - b.v)) / d,
    v: (aa * (c.u - b.u) + bb * (a.u - c.u) + cc * (b.u - a.u)) / d,
  };
}

function add(sketch: Sketch, primitives: readonly SketchPrimitive[]): Sketch {
  return { ...sketch, primitives: [...sketch.primitives, ...primitives] };
}

/** Returns a generator of constraint ids that are unused in the sketch. */
function idsFor(sketch: Sketch): (prefix: string) => SketchId {
  const taken = new Set<SketchId>([
    ...sketch.primitives.map((p) => p.id),
    ...sketch.constraints.map((c) => c.id),
  ]);
  return (prefix) => {
    let n = 1;
    while (taken.has(`${prefix}${n}`)) n += 1;
    const id = `${prefix}${n}`;
    taken.add(id);
    return id;
  };
}
