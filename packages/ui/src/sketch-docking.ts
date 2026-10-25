/**
 * Snapping to other sketches in the same plane, so new geometry can meet existing sketches exactly.
 * Their points and lines are snap targets after the sketch's own and before the grid. Snapped
 * geometry is not constrained to the other sketch (constraints only work within one sketch).
 */

import { type PlaneBasis, planeToWorld, worldToPlane } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
import type { Point2D } from './sketch-tools.js';

/** A snap target on another sketch, in plane millimetres. */
export interface DockPoint {
  at: Point2D;
  kind: 'endpoint' | 'centre' | 'midpoint';
}

export interface Docking {
  points: readonly DockPoint[];
  /** Other sketches' lines as segments. */
  edges: readonly (readonly [Point2D, Point2D])[];
}

export const NO_DOCKING: Docking = { points: [], edges: [] };

/** Maximum distance from the plane, in millimetres, for another sketch to count as in it. */
const ON_PLANE = 1e-4;

/** Points and lines of `others` lying in `basis`, in its coordinates. */
export function dockingFrom(
  others: readonly { plane: PlaneBasis; sketch: Sketch }[],
  basis: PlaneBasis,
): Docking {
  const points: DockPoint[] = [];
  const edges: (readonly [Point2D, Point2D])[] = [];
  for (const { plane, sketch } of others) {
    const here = new Map<string, Point2D>();
    for (const primitive of sketch.primitives) {
      if (primitive.kind !== 'point') continue;
      const world = planeToWorld(plane, primitive.x, primitive.y);
      const n = basis.normal;
      const off =
        (world.x - basis.origin.x) * n.x +
        (world.y - basis.origin.y) * n.y +
        (world.z - basis.origin.z) * n.z;
      if (Math.abs(off) <= ON_PLANE) here.set(primitive.id, worldToPlane(basis, world));
    }
    for (const primitive of sketch.primitives) {
      if (primitive.kind === 'line') {
        const a = here.get(primitive.start);
        const b = here.get(primitive.end);
        if (a === undefined || b === undefined) continue;
        edges.push([a, b]);
        points.push({ at: { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 }, kind: 'midpoint' });
      }
    }
    const centres = new Set(
      sketch.primitives.flatMap((p) => (p.kind === 'circle' || p.kind === 'arc' ? [p.center] : [])),
    );
    for (const [id, at] of here) points.push({ at, kind: centres.has(id) ? 'centre' : 'endpoint' });
  }
  return { points, edges };
}

/**
 * Where `at` snaps on another sketch within `within` mm: nearest point first (corners and centres
 * before midpoints, as in normal snapping), then nearest point on a line. Null if nothing is near.
 */
export function dockOn(
  docking: Docking,
  at: Point2D,
  within: number,
): { at: Point2D; kind: DockPoint['kind'] | 'edge' } | null {
  let best: DockPoint | null = null;
  let nearest = within;
  for (const kind of ['endpoint', 'centre', 'midpoint'] as const) {
    for (const point of docking.points) {
      if (point.kind !== kind) continue;
      const distance = Math.hypot(point.at.u - at.u, point.at.v - at.v);
      if (distance <= nearest) {
        nearest = distance;
        best = point;
      }
    }
    if (best !== null) return best;
  }
  let onEdge: Point2D | null = null;
  nearest = within;
  for (const [a, b] of docking.edges) {
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const lengthSquared = du * du + dv * dv;
    if (lengthSquared < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((at.u - a.u) * du + (at.v - a.v) * dv) / lengthSquared));
    const there = { u: a.u + du * t, v: a.v + dv * t };
    const distance = Math.hypot(there.u - at.u, there.v - at.v);
    if (distance <= nearest) {
      nearest = distance;
      onEdge = there;
    }
  }
  return onEdge === null ? null : { at: onEdge, kind: 'edge' };
}
