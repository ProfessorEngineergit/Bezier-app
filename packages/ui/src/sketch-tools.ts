/**
 * Pure click handling for sketch tools: draft, tool and point in, next draft out. No React,
 * renderer or solver, so shape completion and joining can be tested without a browser.
 *
 * Snapping reuses point ids: `profileFromSketch` finds loops by shared point ids, not by equal
 * coordinates, so a click near an existing point must reuse that point for a loop to be closed in
 * the data (and to give the solver its coincidences).
 */

import type { Sketch, SketchConstraint, SketchId, SketchPoint } from '@bezier/solver';
import { type Docking, dockOn, NO_DOCKING } from './sketch-docking.js';
import { nextSketchId } from './sketch-id.js';
import type { ShapeTool } from './sketch-shapes.js';

/** A point in sketch-plane millimetres. */
export interface Point2D {
  u: number;
  v: number;
}

/** Available sketch tools. */
export type SketchTool =
  | 'line'
  | 'arc'
  | 'circle'
  | 'rectangle'
  | 'center-rectangle'
  | 'trim'
  | 'extend'
  | 'split'
  | 'spline'
  | ShapeTool;

export function emptySketch(): Sketch {
  return { primitives: [], constraints: [] };
}

/**
 * Snap radius in sketch millimetres, not pixels, to keep the camera out of pure geometry. Callers
 * may scale it by zoom.
 */
export const SNAP_DISTANCE = 1.5;

/** The id of the point nearest to `at` within `within`, or null. */
export function pointNear(
  sketch: Sketch,
  at: Point2D,
  within: number = SNAP_DISTANCE,
): SketchId | null {
  let best: SketchId | null = null;
  let bestDistance = within;
  for (const primitive of sketch.primitives) {
    if (primitive.kind !== 'point') continue;
    const distance = Math.hypot(primitive.x - at.u, primitive.y - at.v);
    if (distance <= bestDistance) {
      best = primitive.id;
      bestDistance = distance;
    }
  }
  return best;
}

/** The position of a point by id, or null if it does not exist. */
export function positionOf(sketch: Sketch, id: SketchId): Point2D | null {
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'point' && primitive.id === id) {
      return { u: primitive.x, v: primitive.y };
    }
  }
  return null;
}

/** Snaps a position to the grid step in millimetres. */
export function snapToGrid(at: Point2D, step: number | null): Point2D {
  if (step === null || step <= 0) return at;
  return {
    u: Math.round(at.u / step) * step,
    v: Math.round(at.v / step) * step,
  };
}

/** What a drawn point snapped to, shown as a label next to the pointer (audit F-050). */
export type SnapKind = 'endpoint' | 'centre' | 'origin' | 'midpoint' | 'quadrant' | 'edge' | 'grid';

export const SNAP_NAMES: Readonly<Record<SnapKind, string>> = {
  endpoint: 'Endpoint',
  centre: 'Center',
  origin: 'Origin',
  midpoint: 'Midpoint',
  quadrant: 'Quadrant',
  edge: 'On sketch',
  grid: 'Grid',
};

/**
 * Snaps a drawn point. Priority: existing point (so loops close exactly), origin, a point of
 * another sketch in the plane (`sketch-docking.ts`), line midpoint or circle quadrant, a line of
 * another sketch, grid. `kind` is null for a free position.
 */
export function snapCandidate(
  sketch: Sketch,
  at: Point2D,
  within: number = SNAP_DISTANCE,
  gridStep: number | null = null,
  docking: Docking = NO_DOCKING,
): { at: Point2D; kind: SnapKind | null } {
  const existing = pointNear(sketch, at, within);
  const there = existing === null ? null : positionOf(sketch, existing);
  if (existing !== null && there !== null) {
    const centre = sketch.primitives.some(
      (p) => (p.kind === 'circle' || p.kind === 'arc') && p.center === existing,
    );
    return { at: there, kind: centre ? 'centre' : 'endpoint' };
  }
  // The origin is an anchor every sketch has.
  if (Math.hypot(at.u, at.v) <= within) return { at: { u: 0, v: 0 }, kind: 'origin' };
  const docked = dockOn(docking, at, within);
  if (docked !== null && docked.kind !== 'edge') return docked;
  let best: { at: Point2D; kind: SnapKind } | null = null;
  let nearest = within;
  const offer = (candidate: Point2D, kind: SnapKind) => {
    const distance = Math.hypot(candidate.u - at.u, candidate.v - at.v);
    if (distance > nearest) return;
    nearest = distance;
    best = { at: candidate, kind };
  };
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'line' && primitive.construction !== true) {
      const a = positionOf(sketch, primitive.start);
      const b = positionOf(sketch, primitive.end);
      if (a !== null && b !== null) offer({ u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 }, 'midpoint');
    } else if (primitive.kind === 'circle') {
      const c = positionOf(sketch, primitive.center);
      if (c === null) continue;
      const r = primitive.radius;
      for (const [du, dv] of [
        [r, 0],
        [0, r],
        [-r, 0],
        [0, -r],
      ] as const)
        offer({ u: c.u + du, v: c.v + dv }, 'quadrant');
    }
  }
  if (best !== null) return best;
  if (docked !== null) return docked;
  const gridded = snapToGrid(at, gridStep);
  return { at: gridded, kind: gridded === at ? null : 'grid' };
}

/** Snaps to anchors before the grid, so drawn loops still close exactly. */
export function snapSketchPoint(
  sketch: Sketch,
  at: Point2D,
  within: number = SNAP_DISTANCE,
  gridStep: number | null = null,
  docking: Docking = NO_DOCKING,
): Point2D {
  return snapCandidate(sketch, at, within, gridStep, docking).at;
}

export interface LineHit {
  id: SketchId;
  /** Position along the line: 0 at start, 1 at end. */
  t: number;
  distance: number;
}

/** The nearest non-construction line within `within`, or null. */
export function lineNear(
  sketch: Sketch,
  at: Point2D,
  within: number = SNAP_DISTANCE,
): LineHit | null {
  let best: LineHit | null = null;
  for (const primitive of sketch.primitives) {
    if (primitive.kind !== 'line' || primitive.construction === true) continue;
    const start = positionOf(sketch, primitive.start);
    const end = positionOf(sketch, primitive.end);
    if (start === null || end === null) continue;
    const du = end.u - start.u;
    const dv = end.v - start.v;
    const lengthSquared = du * du + dv * dv;
    if (lengthSquared < 1e-12) continue;
    const t = Math.max(
      0,
      Math.min(1, ((at.u - start.u) * du + (at.v - start.v) * dv) / lengthSquared),
    );
    const distance = Math.hypot(at.u - (start.u + du * t), at.v - (start.v + dv * t));
    if (distance <= within && (best === null || distance < best.distance)) {
      best = { id: primitive.id, t, distance };
    }
  }
  return best;
}

/** Adds a point, or reuses an existing one within `snap`. */
export function ensurePoint(
  sketch: Sketch,
  at: Point2D,
  snap: number = SNAP_DISTANCE,
): { sketch: Sketch; id: SketchId; joined: boolean } {
  const existing = pointNear(sketch, at, snap);
  if (existing !== null) return { sketch, id: existing, joined: true };

  const id = nextSketchId(sketch, 'p');
  const point: SketchPoint = { kind: 'point', id, x: at.u, y: at.v };
  return {
    sketch: { primitives: [...sketch.primitives, point], constraints: sketch.constraints },
    id,
    joined: false,
  };
}

/**
 * Locks a new point placed exactly at the origin there, so the sketch can be fully defined.
 * Only for points new in `next`, and only if nothing is locked at the origin yet.
 */
export function anchorAtOrigin(previous: Sketch, next: Sketch): Sketch {
  if (next.constraints.some((c) => c.kind === 'lock' && c.x === 0 && c.y === 0)) return next;
  const before = new Set(previous.primitives.map((p) => p.id));
  const fresh = next.primitives.find(
    (p) => p.kind === 'point' && !before.has(p.id) && p.x === 0 && p.y === 0,
  );
  if (fresh === undefined) return next;
  return {
    ...next,
    constraints: [
      ...next.constraints,
      { kind: 'lock', id: nextSketchId(next, 'origin'), point: fresh.id, x: 0, y: 0 },
    ],
  };
}

/** Connects two existing points with a line. */
export function connect(sketch: Sketch, start: SketchId, end: SketchId): Sketch {
  // Zero-length line: a double click or a snap onto the start point.
  if (start === end) return sketch;

  const already = sketch.primitives.some(
    (primitive) =>
      primitive.kind === 'line' &&
      ((primitive.start === start && primitive.end === end) ||
        (primitive.start === end && primitive.end === start)),
  );
  if (already) return sketch;

  const id = nextSketchId(sketch, 'l');
  return {
    primitives: [...sketch.primitives, { kind: 'line', id, start, end }],
    constraints: sketch.constraints,
  };
}

/**
 * A rectangle from two opposite corners: four lines on four shared points, with horizontal and
 * vertical constraints. The clicked corners snap; the other two are new points.
 */
export function rectangleAt(
  sketch: Sketch,
  from: Point2D,
  to: Point2D,
  snap: number = SNAP_DISTANCE,
): Sketch {
  const minU = Math.min(from.u, to.u);
  const maxU = Math.max(from.u, to.u);
  const minV = Math.min(from.v, to.v);
  const maxV = Math.max(from.v, to.v);

  // No area: a click, not a drag.
  if (maxU - minU < 1e-6 || maxV - minV < 1e-6) return sketch;

  const corners: Point2D[] = [
    { u: minU, v: minV },
    { u: maxU, v: minV },
    { u: maxU, v: maxV },
    { u: minU, v: maxV },
  ];

  let next = sketch;
  const ids: SketchId[] = [];
  for (const corner of corners) {
    const step = ensurePoint(next, corner, snap);
    next = step.sketch;
    ids.push(step.id);
  }

  // Horizontal on the sides along u, vertical on the sides along v, so the shape stays a rectangle
  // when dimensions change. The kind follows the side index, not the number of lines created: a
  // side that already exists is not created again, and counting would put later sides on the
  // wrong axis (a real solver would then fold the rectangle flat).
  const sides: Array<{ line: SketchId; kind: 'horizontal' | 'vertical' }> = [];
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    const b = ids[(i + 1) % ids.length];
    if (a === undefined || b === undefined) continue;
    const before = next.primitives.length;
    next = connect(next, a, b);
    // The id `connect` created, if any.
    if (next.primitives.length > before) {
      const added = next.primitives[next.primitives.length - 1];
      if (added !== undefined) {
        sides.push({ line: added.id, kind: i % 2 === 0 ? 'horizontal' : 'vertical' });
      }
    }
  }

  // Check against all ids in use: after a constraint is deleted the count may name a taken id,
  // and planegcs rejects duplicate ids.
  const taken = new Set<SketchId>([
    ...next.primitives.map((primitive) => primitive.id),
    ...next.constraints.map((constraint) => constraint.id),
  ]);
  let index = next.constraints.length;
  const constraints: SketchConstraint[] = [];
  for (const { line, kind } of sides) {
    while (taken.has(`c${index}`)) index += 1;
    const id = `c${index}`;
    taken.add(id);
    constraints.push({ kind, id, line });
  }

  return { primitives: next.primitives, constraints: [...next.constraints, ...constraints] };
}

/** A rectangle from its centre and one corner. */
export function centerRectangleAt(
  sketch: Sketch,
  center: Point2D,
  corner: Point2D,
  snap: number = SNAP_DISTANCE,
): Sketch {
  return rectangleAt(
    sketch,
    { u: center.u * 2 - corner.u, v: center.v * 2 - corner.v },
    corner,
    snap,
  );
}
