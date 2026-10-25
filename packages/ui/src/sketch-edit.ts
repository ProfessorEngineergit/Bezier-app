/**
 * Sketch edit operations: extend, split, offset, mirror, pattern, and move/rotate/scale. Pure.
 * Copies get constraints where the solver can maintain the relation (mirror symmetry); pattern
 * copies are placed and then independent.
 */

import { sampleEllipse, sampleSpline } from '@bezier/core';
import type { Sketch, SketchConstraint, SketchId, SketchPrimitive } from '@bezier/solver';
import { nextSketchId, pointsOf } from './sketch-id.js';
import { ensurePoint, lineNear, type Point2D, positionOf } from './sketch-tools.js';

export type EditResult = { ok: true; sketch: Sketch } | { ok: false; message: string };

const refuse = (message: string): EditResult => ({ ok: false, message });

/**
 * Extends the clicked line from its nearer end to the first line, circle or arc it meets. Only a
 * free end moves; a shared end would drag the other element along.
 */
export function extendAt(sketch: Sketch, at: Point2D, within: number): EditResult {
  const hit = lineNear(sketch, at, within);
  const line = hit && sketch.primitives.find((p) => p.id === hit.id);
  if (!hit || line?.kind !== 'line') return refuse('Click near the end of a line to extend it.');
  const [moving, fixed] = hit.t >= 0.5 ? [line.end, line.start] : [line.start, line.end];
  const tip = positionOf(sketch, moving);
  const base = positionOf(sketch, fixed);
  if (tip === null || base === null) return refuse('That line has no ends.');
  if (usersOf(sketch, moving) > 1) return refuse('That end is joined to something else.');
  const length = Math.hypot(tip.u - base.u, tip.v - base.v);
  const dir = { u: (tip.u - base.u) / length, v: (tip.v - base.v) / length };
  let nearest = Number.POSITIVE_INFINITY;
  for (const other of sketch.primitives) {
    if (other.id === line.id) continue;
    for (const s of rayHits(sketch, other, tip, dir)) if (s > 1e-6 && s < nearest) nearest = s;
  }
  if (!Number.isFinite(nearest)) return refuse('Nothing lies ahead of that end to extend to.');
  return {
    ok: true,
    sketch: movePoints(
      sketch,
      new Map([[moving, { u: tip.u + dir.u * nearest, v: tip.v + dir.v * nearest }]]),
    ),
  };
}

/** Splits the clicked line at the click point; the halves share the new point. */
export function splitAt(sketch: Sketch, at: Point2D, within: number): EditResult {
  const hit = lineNear(sketch, at, within);
  const line = hit && sketch.primitives.find((p) => p.id === hit.id);
  if (!hit || line?.kind !== 'line') return refuse('Click on a line to split it.');
  if (hit.t < 0.01 || hit.t > 0.99) return refuse('Click along the line, not on its end.');
  const a = positionOf(sketch, line.start);
  const b = positionOf(sketch, line.end);
  if (a === null || b === null) return refuse('That line has no ends.');
  const cut = ensurePoint(
    sketch,
    { u: a.u + (b.u - a.u) * hit.t, v: a.v + (b.v - a.v) * hit.t },
    1e-9,
  );
  let next = cut.sketch;
  const second = nextSketchId(next, 'l');
  // The first half keeps the line's id and thus its constraints.
  const axis = next.constraints.filter(
    (c) => (c.kind === 'horizontal' || c.kind === 'vertical') && c.line === line.id,
  );
  next = {
    primitives: [
      ...next.primitives.map((p) => (p.id === line.id ? { ...line, end: cut.id } : p)),
      { ...line, id: second, start: cut.id },
    ],
    constraints: [
      // Length and midpoint constraints referred to the whole line; drop them.
      ...next.constraints.filter(
        (c) =>
          !(
            (c.kind === 'distance' && joinsEnds(c, line)) ||
            (c.kind === 'midpoint' && c.line === line.id)
          ),
      ),
      ...axis.map((c) => ({ ...c, id: nextSketchId(next, 'c'), line: second })),
    ],
  };
  return { ok: true, sketch: next };
}

/**
 * Offset copies of the picked lines, circles and arcs at `distance`. Connected lines stay
 * connected: each copied corner is the intersection of its two offset sides. Positive goes left of
 * a line's direction and outward for circles and arcs.
 */
export function offsetSelection(
  sketch: Sketch,
  selected: readonly SketchId[],
  distance: number,
): EditResult {
  if (distance === 0) return refuse('Give the offset a distance.');
  const picked = primitivesOf(sketch, selected).filter((p) => p.kind !== 'point');
  if (picked.length === 0) return refuse('Select the lines, circles or arcs to offset.');
  let next = sketch;
  const lines = picked.filter((p) => p.kind === 'line');
  // Offset each line (point plus direction), then intersect neighbours for the ends.
  const shifted = new Map<SketchId, { p: Point2D; d: Point2D }>();
  for (const line of lines) {
    const a = positionOf(sketch, line.start);
    const b = positionOf(sketch, line.end);
    if (a === null || b === null) continue;
    const length = Math.hypot(b.u - a.u, b.v - a.v);
    if (length < 1e-9) continue;
    const d = { u: (b.u - a.u) / length, v: (b.v - a.v) / length };
    shifted.set(line.id, { p: { u: a.u - d.v * distance, v: a.v + d.u * distance }, d });
  }
  const copies = new Map<SketchId, SketchId>();
  const endAt = (line: SketchPrimitive & { kind: 'line' }, end: SketchId): Point2D | null => {
    const own = shifted.get(line.id);
    if (own === undefined) return null;
    const neighbour = lines.find((o) => o.id !== line.id && (o.start === end || o.end === end));
    const meet = neighbour && shifted.get(neighbour.id);
    const crossing = meet ? lineCrossing(own.p, own.d, meet.p, meet.d) : null;
    if (crossing !== null) return crossing;
    const at = positionOf(sketch, end);
    return at === null ? null : { u: at.u - own.d.v * distance, v: at.v + own.d.u * distance };
  };
  const pointFor = (line: SketchPrimitive & { kind: 'line' }, end: SketchId) => {
    const known = copies.get(end);
    if (known !== undefined) return known;
    const at = endAt(line, end);
    if (at === null) return null;
    const made = ensurePoint(next, at, 1e-9);
    next = made.sketch;
    copies.set(end, made.id);
    return made.id;
  };
  const added: SketchPrimitive[] = [];
  for (const line of lines) {
    const s = pointFor(line, line.start);
    const e = pointFor(line, line.end);
    if (s === null || e === null || s === e) continue;
    const id = nextSketchId({ ...next, primitives: [...next.primitives, ...added] }, 'l');
    added.push({ kind: 'line', id, start: s, end: e });
  }
  next = { ...next, primitives: [...next.primitives, ...added] };
  for (const round of picked) {
    if (round.kind === 'circle') {
      const radius = round.radius + distance;
      if (radius <= 0) return refuse('That offset is larger than the circle.');
      next = add(next, {
        kind: 'circle',
        id: nextSketchId(next, 'o'),
        center: round.center,
        radius,
      });
    }
    if (round.kind === 'arc') {
      const c = positionOf(sketch, round.center);
      const s = positionOf(sketch, round.start);
      const e = positionOf(sketch, round.end);
      if (c === null || s === null || e === null) continue;
      const r = Math.hypot(s.u - c.u, s.v - c.v);
      const k = (r + distance) / r;
      if (k <= 0) return refuse('That offset is larger than the arc.');
      const out = (p: Point2D) => ({ u: c.u + (p.u - c.u) * k, v: c.v + (p.v - c.v) * k });
      const ns = ensurePoint(next, out(s), 1e-9);
      const ne = ensurePoint(ns.sketch, out(e), 1e-9);
      next = add(ne.sketch, {
        kind: 'arc',
        id: nextSketchId(ne.sketch, 'a'),
        center: round.center,
        start: ns.id,
        end: ne.id,
      });
    }
  }
  return { ok: true, sketch: next };
}

/**
 * Mirrors the picked elements about the last picked line. Copied points are constrained symmetric
 * to their originals, so the copy follows changes.
 */
export function mirrorSelection(sketch: Sketch, selected: readonly SketchId[]): EditResult {
  const picked = primitivesOf(sketch, selected);
  const axis = [...picked].reverse().find((p) => p.kind === 'line');
  if (axis?.kind !== 'line' || picked.length < 2)
    return refuse('Select what to mirror, then the line to mirror it about.');
  const a = positionOf(sketch, axis.start);
  const b = positionOf(sketch, axis.end);
  if (a === null || b === null) return refuse('The mirror line has no ends.');
  const length = Math.hypot(b.u - a.u, b.v - a.v);
  const d = { u: (b.u - a.u) / length, v: (b.v - a.v) / length };
  const reflect = (p: Point2D) => {
    const t = (p.u - a.u) * d.u + (p.v - a.v) * d.v;
    const foot = { u: a.u + d.u * t, v: a.v + d.v * t };
    return { u: 2 * foot.u - p.u, v: 2 * foot.v - p.v };
  };
  const copied = copyPrimitives(
    sketch,
    picked.filter((p) => p.id !== axis.id),
    reflect,
    true,
  );
  const relations: SketchConstraint[] = [];
  let ids = copied.sketch;
  for (const [from, to] of copied.points) {
    if (from === to) continue;
    const id = nextSketchId(ids, 'sym');
    relations.push({ kind: 'symmetric', id, a: from, b: to, about: axis.id });
    ids = {
      ...ids,
      constraints: [...ids.constraints, relations[relations.length - 1] as SketchConstraint],
    };
  }
  return {
    ok: true,
    sketch: { ...copied.sketch, constraints: [...copied.sketch.constraints, ...relations] },
  };
}

/** Pattern kind: linear by a step, or circular about a centre through a full or partial turn. */
export type Repeat =
  | { kind: 'linear'; count: number; step: Point2D }
  | { kind: 'polar'; count: number; center: Point2D; angle: number };

/** Pattern copies of the picked elements; `count` includes the original. */
export function patternSelection(
  sketch: Sketch,
  selected: readonly SketchId[],
  repeat: Repeat,
): EditResult {
  const picked = primitivesOf(sketch, selected);
  if (picked.length === 0) return refuse('Select what to repeat.');
  if (!(repeat.count >= 2)) return refuse('A pattern needs at least two.');
  let next = sketch;
  for (let k = 1; k < repeat.count; k += 1) {
    const place =
      repeat.kind === 'linear'
        ? (p: Point2D) => ({ u: p.u + repeat.step.u * k, v: p.v + repeat.step.v * k })
        : (() => {
            // A full turn's last position equals its first, so divide by the count.
            const full = Math.abs(Math.abs(repeat.angle) - 2 * Math.PI) < 1e-9;
            const turn = (repeat.angle / (full ? repeat.count : repeat.count - 1)) * k;
            const cos = Math.cos(turn);
            const sin = Math.sin(turn);
            const c = repeat.center;
            return (p: Point2D) => ({
              u: c.u + (p.u - c.u) * cos - (p.v - c.v) * sin,
              v: c.v + (p.u - c.u) * sin + (p.v - c.v) * cos,
            });
          })();
    next = copyPrimitives(next, picked, place, false).sketch;
  }
  return { ok: true, sketch: next };
}

/**
 * Maps every point used by the picked elements through `map` (move, rotate or scale part of a
 * sketch). Circle radii scale too when `scale` is given.
 */
export function transformSelection(
  sketch: Sketch,
  selected: readonly SketchId[],
  map: (p: Point2D) => Point2D,
  scale = 1,
): EditResult {
  const picked = primitivesOf(sketch, selected);
  if (picked.length === 0) return refuse('Select what to move.');
  const moves = new Map<SketchId, Point2D>();
  for (const id of new Set(picked.flatMap(pointsOf))) {
    const at = positionOf(sketch, id);
    if (at !== null) moves.set(id, map(at));
  }
  const moved = movePoints(sketch, moves);
  if (scale === 1) return { ok: true, sketch: moved };
  const scaled = new Set(picked.map((p) => p.id));
  return {
    ok: true,
    sketch: {
      ...moved,
      primitives: moved.primitives.map((p) =>
        p.kind === 'circle' && scaled.has(p.id) ? { ...p, radius: p.radius * Math.abs(scale) } : p,
      ),
    },
  };
}

// ---- Helpers

function primitivesOf(sketch: Sketch, ids: readonly SketchId[]): SketchPrimitive[] {
  return ids.flatMap((id) => sketch.primitives.filter((p) => p.id === id));
}

function usersOf(sketch: Sketch, point: SketchId): number {
  return sketch.primitives.filter((p) => p.kind !== 'point' && pointsOf(p).includes(point)).length;
}

function joinsEnds(c: { a: SketchId; b: SketchId }, line: { start: SketchId; end: SketchId }) {
  return (c.a === line.start && c.b === line.end) || (c.a === line.end && c.b === line.start);
}

function add(sketch: Sketch, primitive: SketchPrimitive): Sketch {
  return { ...sketch, primitives: [...sketch.primitives, primitive] };
}

function movePoints(sketch: Sketch, moves: ReadonlyMap<SketchId, Point2D>): Sketch {
  return {
    primitives: sketch.primitives.map((p) => {
      const to = p.kind === 'point' ? moves.get(p.id) : undefined;
      return to === undefined ? p : { ...p, x: to.u, y: to.v };
    }),
    // A locked point that is moved explicitly is re-locked at its new position.
    constraints: sketch.constraints.map((c) => {
      const to = c.kind === 'lock' ? moves.get(c.point) : undefined;
      return to === undefined ? c : { ...c, x: to.u, y: to.v };
    }),
  };
}

/**
 * Copies primitives, mapping every point through `place`; shared points stay shared. `mirrored`
 * reverses arcs, since a reflection reverses their direction.
 */
function copyPrimitives(
  sketch: Sketch,
  picked: readonly SketchPrimitive[],
  place: (p: Point2D) => Point2D,
  mirrored: boolean,
): { sketch: Sketch; points: Map<SketchId, SketchId> } {
  let next = sketch;
  const points = new Map<SketchId, SketchId>();
  const copyOf = (id: SketchId) => {
    const known = points.get(id);
    if (known !== undefined) return known;
    const at = positionOf(sketch, id);
    if (at === null) return id;
    const made = ensurePoint(next, place(at), 1e-9);
    next = made.sketch;
    points.set(id, made.id);
    return made.id;
  };
  for (const p of picked) {
    if (p.kind === 'point') {
      copyOf(p.id);
      continue;
    }
    const construction = p.construction === true ? { construction: true } : {};
    if (p.kind === 'line') {
      const start = copyOf(p.start);
      const end = copyOf(p.end);
      next = add(next, { kind: 'line', id: nextSketchId(next, 'l'), start, end, ...construction });
    } else if (p.kind === 'circle') {
      const center = copyOf(p.center);
      next = add(next, {
        kind: 'circle',
        id: nextSketchId(next, 'o'),
        center,
        radius: p.radius,
        ...construction,
      });
    } else if (p.kind === 'spline') {
      // A reflected spline runs the other way; the curve is the same.
      const through = p.points.map(copyOf);
      next = add(next, {
        kind: 'spline',
        id: nextSketchId(next, 's'),
        points: through,
        ...(p.closed === true ? { closed: true } : {}),
        ...construction,
      });
    } else if (p.kind === 'ellipse') {
      const center = copyOf(p.center);
      const vertex = copyOf(p.vertex);
      next = add(next, {
        kind: 'ellipse',
        id: nextSketchId(next, 'e'),
        center,
        vertex,
        minor: p.minor,
        ...construction,
      });
    } else {
      const center = copyOf(p.center);
      const start = copyOf(p.start);
      const end = copyOf(p.end);
      next = add(next, {
        kind: 'arc',
        id: nextSketchId(next, 'a'),
        center,
        start: mirrored ? end : start,
        end: mirrored ? start : end,
        ...construction,
      });
    }
  }
  return { sketch: next, points };
}

function lineCrossing(p: Point2D, d: Point2D, q: Point2D, e: Point2D): Point2D | null {
  const denominator = d.u * e.v - d.v * e.u;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((q.u - p.u) * e.v - (q.v - p.v) * e.u) / denominator;
  return { u: p.u + d.u * t, v: p.v + d.v * t };
}

/** Distances along a ray from `from` in unit direction `dir` where it meets an element. */
function rayHits(sketch: Sketch, other: SketchPrimitive, from: Point2D, dir: Point2D): number[] {
  if (other.kind === 'line') {
    const a = positionOf(sketch, other.start);
    const b = positionOf(sketch, other.end);
    if (a === null || b === null) return [];
    const e = { u: b.u - a.u, v: b.v - a.v };
    const denominator = dir.u * e.v - dir.v * e.u;
    if (Math.abs(denominator) < 1e-12) return [];
    const s = ((a.u - from.u) * e.v - (a.v - from.v) * e.u) / denominator;
    const t = ((a.u - from.u) * dir.v - (a.v - from.v) * dir.u) / denominator;
    return t >= -1e-9 && t <= 1 + 1e-9 ? [s] : [];
  }
  if (other.kind === 'point') return [];
  if (other.kind === 'spline' || other.kind === 'ellipse') {
    // Intersect the curve as a fine polyline.
    const at = (id: SketchId) => {
      const p = positionOf(sketch, id);
      return p === null ? null : { x: p.u, y: p.v };
    };
    const path =
      other.kind === 'spline'
        ? (() => {
            const through = other.points.map(at);
            return through.some((p) => p === null)
              ? []
              : sampleSpline(through as { x: number; y: number }[], other.closed === true);
          })()
        : (() => {
            const c0 = at(other.center);
            const v0 = at(other.vertex);
            return c0 === null || v0 === null ? [] : sampleEllipse(c0, v0, other.minor);
          })();
    const hits: number[] = [];
    for (let k = 0; k + 1 < path.length; k += 1) {
      const a = path[k] as { x: number; y: number };
      const b = path[k + 1] as { x: number; y: number };
      const e = { u: b.x - a.x, v: b.y - a.y };
      const denominator = dir.u * e.v - dir.v * e.u;
      if (Math.abs(denominator) < 1e-12) continue;
      const s0 = ((a.x - from.u) * e.v - (a.y - from.v) * e.u) / denominator;
      const t0 = ((a.x - from.u) * dir.v - (a.y - from.v) * dir.u) / denominator;
      if (t0 >= 0 && t0 <= 1) hits.push(s0);
    }
    return hits;
  }
  const c = positionOf(sketch, other.center);
  if (c === null) return [];
  const r =
    other.kind === 'circle'
      ? other.radius
      : (() => {
          const s = positionOf(sketch, other.start);
          return s === null ? 0 : Math.hypot(s.u - c.u, s.v - c.v);
        })();
  const f = { u: from.u - c.u, v: from.v - c.v };
  const b = f.u * dir.u + f.v * dir.v;
  const disc = b * b - (f.u * f.u + f.v * f.v - r * r);
  if (disc < 0) return [];
  const roots = [-b - Math.sqrt(disc), -b + Math.sqrt(disc)];
  if (other.kind === 'circle') return roots;
  const s = positionOf(sketch, other.start);
  const e = positionOf(sketch, other.end);
  if (s === null || e === null) return [];
  const from0 = Math.atan2(s.v - c.v, s.u - c.u);
  const span = positive(Math.atan2(e.v - c.v, e.u - c.u) - from0);
  return roots.filter((root) => {
    const hit = { u: from.u + dir.u * root, v: from.v + dir.v * root };
    return positive(Math.atan2(hit.v - c.v, hit.u - c.u) - from0) <= span + 1e-9;
  });
}

function positive(angle: number): number {
  const turn = 2 * Math.PI;
  return ((angle % turn) + turn) % turn;
}
