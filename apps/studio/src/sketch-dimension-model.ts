/** Pure world-space dimension models for committed and pending sketch geometry. */

import { type PlaneBasis, planeToWorld, type SketchSurface, surfaceBasis } from '@bezier/core';
import type {
  Sketch,
  SketchArc,
  SketchCircle,
  SketchConstraint,
  SketchId,
  SketchLine,
  SketchPoint,
} from '@bezier/solver';

export interface SketchDimension {
  id: string;
  sourceId?: SketchId;
  /** `constraint`: a standalone dimension constraint, edited by its id. */
  sourceKind?: 'line' | 'circle' | 'constraint';
  /** Reference (driven) dimension: shown in brackets, not editable. */
  isReference?: boolean;
  prefix?: 'R' | '⌀';
  live?: boolean;
  length: number;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  reference: { x: number; y: number; z: number };
}

export function dimensionsOf(plane: SketchSurface, sketch: Sketch): readonly SketchDimension[] {
  const basis = surfaceBasis(plane);
  if (basis === null) return [];
  const points = new Map<SketchId, SketchPoint>();
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'point') points.set(primitive.id, primitive);
  }
  // Lines that are part of a text are not labelled; the text has its own size.
  const lines = sketch.primitives.filter(
    (primitive): primitive is SketchLine =>
      primitive.kind === 'line' && primitive.construction !== true && primitive.group === undefined,
  );
  const dimensions: SketchDimension[] = [];
  const center = centerOf(points.values());
  for (const line of labelledLines(sketch, lines)) {
    const start = points.get(line.start);
    const end = points.get(line.end);
    if (start === undefined || end === undefined) continue;
    dimensions.push({
      id: line.id,
      sourceId: line.id,
      sourceKind: 'line',
      isReference: referenced(sketch, (c) => c.kind === 'distance' && joins(c, line)),
      length: Math.hypot(end.x - start.x, end.y - start.y),
      start: planeToWorld(basis, start.x, start.y),
      end: planeToWorld(basis, end.x, end.y),
      reference: planeToWorld(basis, center.u, center.v),
    });
  }
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'circle' && primitive.construction !== true) {
      const centerPoint = points.get(primitive.center);
      if (centerPoint !== undefined) {
        dimensions.push({
          ...circleDimension(basis, primitive, centerPoint),
          isReference: referenced(
            sketch,
            (c) => (c.kind === 'radius' || c.kind === 'diameter') && c.circle === primitive.id,
          ),
        });
      }
    }
    if (primitive.kind === 'arc' && primitive.construction !== true) {
      const centerPoint = points.get(primitive.center);
      const startPoint = points.get(primitive.start);
      if (centerPoint !== undefined && startPoint !== undefined) {
        dimensions.push(arcDimension(basis, primitive, centerPoint, startPoint));
      }
    }
  }
  dimensions.push(...constraintDimensions(basis, sketch, points, lines, center));
  return dimensions;
}

function joins(c: { a: SketchId; b: SketchId }, line: SketchLine): boolean {
  return (c.a === line.start && c.b === line.end) || (c.a === line.end && c.b === line.start);
}

function referenced(sketch: Sketch, which: (c: SketchConstraint) => boolean): boolean {
  return sketch.constraints.some((c) => which(c) && 'reference' in c && c.reference === true);
}

/**
 * Standalone dimension constraints: point to point, along x or y, or point to line. Each measures
 * the current drawing, so reference dimensions show actual values.
 */
function constraintDimensions(
  basis: PlaneBasis,
  sketch: Sketch,
  points: ReadonlyMap<SketchId, SketchPoint>,
  lines: readonly SketchLine[],
  center: { u: number; v: number },
): SketchDimension[] {
  const out: SketchDimension[] = [];
  const at = (u: number, v: number) => planeToWorld(basis, u, v);
  for (const c of sketch.constraints) {
    let span: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
    if (c.kind === 'distance' && !lines.some((line) => joins(c, line))) {
      const a = points.get(c.a);
      const b = points.get(c.b);
      if (a && b) span = { from: a, to: b };
    } else if (c.kind === 'horizontalDistance' || c.kind === 'verticalDistance') {
      const a = points.get(c.a);
      const b = points.get(c.b);
      if (a && b)
        span = {
          from: a,
          to: c.kind === 'horizontalDistance' ? { x: b.x, y: a.y } : { x: a.x, y: b.y },
        };
    } else if (c.kind === 'pointLineDistance') {
      const p = points.get(c.point);
      const line = sketch.primitives.find((x) => x.id === c.line);
      const s = line?.kind === 'line' ? points.get(line.start) : undefined;
      const e = line?.kind === 'line' ? points.get(line.end) : undefined;
      if (p && s && e) {
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const t = ((p.x - s.x) * dx + (p.y - s.y) * dy) / (dx * dx + dy * dy || 1);
        span = { from: { x: s.x + dx * t, y: s.y + dy * t }, to: p };
      }
    }
    if (span === null) continue;
    out.push({
      id: c.id,
      sourceId: c.id,
      sourceKind: 'constraint',
      isReference: 'reference' in c && c.reference === true,
      length: Math.hypot(span.to.x - span.from.x, span.to.y - span.from.y),
      start: at(span.from.x, span.from.y),
      end: at(span.to.x, span.to.y),
      reference: at(center.u, center.v),
    });
  }
  return out;
}

/**
 * Lines that get a length label: all of them, except one width and one height per rectangle.
 * Decided per rectangle, so several rectangles do not stack eight labels.
 */
function labelledLines(sketch: Sketch, lines: readonly SketchLine[]): readonly SketchLine[] {
  const squared = new Set(
    sketch.constraints.flatMap((constraint) =>
      constraint.kind === 'horizontal' || constraint.kind === 'vertical' ? [constraint.line] : [],
    ),
  );
  const shown: SketchLine[] = [];
  const placed = new Set<SketchId>();
  for (const line of lines) {
    if (placed.has(line.id)) continue;
    const loop = connected(lines, line);
    for (const member of loop) placed.add(member.id);
    const rectangle = loop.length === 4 && loop.every((member) => squared.has(member.id));
    // A regular polygon's sides are equal, so one label suffices.
    shown.push(
      ...(rectangle ? loop.slice(0, 2) : regularPolygon(sketch, loop) ? loop.slice(0, 1) : loop),
    );
  }
  return shown;
}

/**
 * Whether a loop is a regular polygon as the Polygon tool draws it (all corners on one construction
 * circle). Also used by the marks, which leave its own relations unmarked.
 */
export function regularPolygon(sketch: Sketch, loop: readonly SketchLine[]): boolean {
  if (loop.length < 3) return false;
  const circles = new Set<SketchId>();
  for (const line of loop)
    for (const end of [line.start, line.end]) {
      const on = sketch.constraints.find((c) => c.kind === 'pointOn' && c.point === end);
      if (on?.kind !== 'pointOn') return false;
      circles.add(on.on);
    }
  const [circle] = circles;
  const held = sketch.primitives.find((p) => p.id === circle);
  return circles.size === 1 && held?.kind === 'circle' && held.construction === true;
}

/** The lines joined to `start` through shared endpoints, in drawing order. */
function connected(lines: readonly SketchLine[], start: SketchLine): SketchLine[] {
  const points = new Set<SketchId>([start.start, start.end]);
  const found = new Set<SketchId>([start.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const line of lines) {
      if (found.has(line.id) || !(points.has(line.start) || points.has(line.end))) continue;
      found.add(line.id);
      points.add(line.start);
      points.add(line.end);
      grew = true;
    }
  }
  return lines.filter((line) => found.has(line.id));
}

function circleDimension(
  basis: PlaneBasis,
  circle: SketchCircle,
  center: SketchPoint,
): SketchDimension {
  return {
    id: circle.id,
    sourceId: circle.id,
    sourceKind: 'circle',
    prefix: '⌀',
    length: circle.radius * 2,
    start: planeToWorld(basis, center.x, center.y),
    end: planeToWorld(basis, center.x + circle.radius, center.y),
    reference: planeToWorld(basis, center.x, center.y),
  };
}

function arcDimension(
  basis: PlaneBasis,
  arc: SketchArc,
  center: SketchPoint,
  start: SketchPoint,
): SketchDimension {
  return {
    id: arc.id,
    prefix: 'R',
    length: Math.hypot(start.x - center.x, start.y - center.y),
    start: planeToWorld(basis, center.x, center.y),
    end: planeToWorld(basis, start.x, start.y),
    reference: planeToWorld(basis, center.x, center.y),
  };
}

export function pendingDimensions(
  plane: SketchSurface,
  pending: readonly { u: number; v: number }[],
): readonly SketchDimension[] {
  const basis = surfaceBasis(plane);
  if (basis === null) return [];
  if (pending.length > 8) return [pendingCurveDimension(basis, pending)];
  const segmentCount = pending.length === 5 ? 2 : pending.length - 1;
  const dimensions: SketchDimension[] = [];
  const center = centerOf(pending.map((point) => ({ x: point.u, y: point.v })));
  for (let index = 0; index < segmentCount; index += 1) {
    const start = pending[index];
    const end = pending[index + 1];
    if (start === undefined || end === undefined) continue;
    const length = Math.hypot(end.u - start.u, end.v - start.v);
    if (length < 1e-6) continue;
    dimensions.push({
      id: `pending-${index}`,
      live: true,
      length,
      start: planeToWorld(basis, start.u, start.v),
      end: planeToWorld(basis, end.u, end.v),
      reference: planeToWorld(basis, center.u, center.v),
    });
  }
  return dimensions;
}

function pendingCurveDimension(
  basis: PlaneBasis,
  pending: readonly { u: number; v: number }[],
): SketchDimension {
  const first = pending[0] ?? { u: 0, v: 0 };
  const middle = pending[Math.floor(pending.length / 2)] ?? first;
  const last = pending[pending.length - 1] ?? first;
  const closed = Math.hypot(first.u - last.u, first.v - last.v) < 1e-6;
  const center = closed
    ? { u: (first.u + middle.u) / 2, v: (first.v + middle.v) / 2 }
    : circleCenter(first, middle, last);
  const radius = Math.hypot(first.u - center.u, first.v - center.v);
  return {
    id: 'pending-curve',
    live: true,
    prefix: closed ? '⌀' : 'R',
    length: closed ? radius * 2 : radius,
    start: planeToWorld(basis, center.u, center.v),
    end: planeToWorld(basis, first.u, first.v),
    reference: planeToWorld(basis, center.u, center.v),
  };
}

function circleCenter(
  a: { u: number; v: number },
  b: { u: number; v: number },
  c: { u: number; v: number },
): { u: number; v: number } {
  const d = 2 * (a.u * (b.v - c.v) + b.u * (c.v - a.v) + c.u * (a.v - b.v));
  if (Math.abs(d) < 1e-9) return centerOf([a, b, c].map((point) => ({ x: point.u, y: point.v })));
  const aa = a.u * a.u + a.v * a.v;
  const bb = b.u * b.u + b.v * b.v;
  const cc = c.u * c.u + c.v * c.v;
  return {
    u: (aa * (b.v - c.v) + bb * (c.v - a.v) + cc * (a.v - b.v)) / d,
    v: (aa * (c.u - b.u) + bb * (a.u - c.u) + cc * (b.u - a.u)) / d,
  };
}

function centerOf(points: Iterable<{ x: number; y: number }>): { u: number; v: number } {
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minU = Math.min(minU, point.x);
    maxU = Math.max(maxU, point.x);
    minV = Math.min(minV, point.y);
    maxV = Math.max(maxV, point.y);
  }
  if (!Number.isFinite(minU)) return { u: 0, v: 0 };
  return { u: (minU + maxU) / 2, v: (minV + maxV) / 2 };
}
