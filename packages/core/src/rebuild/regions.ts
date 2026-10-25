/**
 * The closed regions a sketch encloses, found by planar arrangement:
 *
 *   1. every curve is split where it meets another, so crossings become corners
 *   2. the pieces form a graph; strays that bound nothing are dropped
 *   3. walking the graph always turning the same way traces every face once
 *   4. faces wound counter-clockwise are areas; clockwise ones are the outline of a whole connected
 *      drawing, which becomes a hole in whatever area encloses it
 *
 * A region's `key` names it by its outline pieces, so it survives dimension changes.
 */

import type { ProfilePoint, ProfileSegment } from '@bezier/kernel';
import type { Point2, Sketch, SketchId } from '@bezier/solver';
import { bezierChainBetween } from './curve-math.js';
import {
  type Curve,
  curvesOf,
  ends,
  extentOf,
  isClosedCurve,
  lengthOf,
  meetings,
  pointOn,
  TAU,
} from './regions-curves.js';

export interface SketchRegion {
  /** Stable name: the outline's pieces, sorted. See the module comment. */
  key: string;
  /** Outline first, then holes, as exact segments in the sketch's own plane. */
  loops: readonly (readonly ProfileSegment[])[];
  /** The outline and holes as polygons, for filling and for hit testing. */
  outline: readonly Point2[];
  holes: readonly (readonly Point2[])[];
  /** Area in square millimetres, holes taken out. */
  area: number;
}

/** Where a point is and how big a circle is, after solving or as drawn. */
export interface SketchGeometry {
  point(id: SketchId): Point2 | null;
  radius(circle: SketchId, drawn: number): number;
}

/** The geometry as drawn, for display before anything is solved. */
export function drawnGeometry(sketch: Sketch): SketchGeometry {
  const points = new Map<SketchId, Point2>();
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'point') points.set(primitive.id, { x: primitive.x, y: primitive.y });
  }
  return { point: (id) => points.get(id) ?? null, radius: (_id, drawn) => drawn };
}

/** One piece of a split curve, between two parameters. */
interface Piece {
  id: string;
  curve: Curve;
  t0: number;
  t1: number;
  start: number;
  end: number;
}

export function sketchRegions(sketch: Sketch, geometry: SketchGeometry): readonly SketchRegion[] {
  const curves = curvesOf(sketch, geometry);
  if (curves.length === 0) return [];
  const scale = extentOf(curves);
  const eps = Math.max(1e-9, scale * 1e-9);
  const merge = Math.max(1e-7, scale * 1e-7);

  const cuts = curves.map((curve) => new Set<number>(ends(curve)));
  // Bounding-box rejection first; most pairs in large sketches (e.g. text) never touch.
  const boxes = curves.map((curve) => boxOf(curve, merge));
  for (let i = 0; i < curves.length; i += 1) {
    for (let j = i + 1; j < curves.length; j += 1) {
      const a = curves[i];
      const b = curves[j];
      if (a === undefined || b === undefined) continue;
      const ba = boxes[i];
      const bb = boxes[j];
      if (ba && bb && (ba[0] > bb[2] || bb[0] > ba[2] || ba[1] > bb[3] || bb[1] > ba[3])) continue;
      for (const [ta, tb] of meetings(a, b, eps)) {
        cuts[i]?.add(ta);
        cuts[j]?.add(tb);
      }
    }
  }

  const nodes: Point2[] = [];
  const nodeAt = (p: Point2): number => {
    const found = nodes.findIndex((n) => Math.hypot(n.x - p.x, n.y - p.y) <= merge);
    if (found !== -1) return found;
    nodes.push(p);
    return nodes.length - 1;
  };

  const pieces: Piece[] = [];
  curves.forEach((curve, index) => {
    const params = [...(cuts[index] ?? [])].sort((p, q) => p - q);
    const closed = isClosedCurve(curve);
    // A closed curve needs two vertices to form a loop; a single crossing gets an opposite partner.
    if (closed && params.length === 0) params.push(0, 0.5);
    else if (closed && params.length === 1) params.push(((params[0] ?? 0) + 0.5) % 1);
    params.sort((p, q) => p - q);
    const spans: [number, number][] = [];
    for (let k = 0; k + 1 < params.length; k += 1) {
      spans.push([params[k] ?? 0, params[k + 1] ?? 0]);
    }
    if (closed) spans.push([params[params.length - 1] ?? 0, (params[0] ?? 0) + 1]);
    spans.forEach(([t0, t1], k) => {
      if (lengthOf(curve, t0, t1) <= merge) return;
      const start = nodeAt(pointOn(curve, t0));
      const end = nodeAt(pointOn(curve, t1));
      if (start === end && curve.kind === 'line') return;
      pieces.push({
        id: spans.length > 1 ? `${curve.id}#${k}` : curve.id,
        curve,
        t0,
        t1,
        start,
        end,
      });
    });
  });

  // Keep one copy of duplicated segments (common in DXF), or they close a zero-area sliver that
  // traps the face walk (audit F-069).
  const unique = pieces.filter((piece, index) => {
    const middle = pointOn(piece.curve, (piece.t0 + piece.t1) / 2);
    return !pieces.slice(0, index).some((other) => {
      const sameEnds =
        (other.start === piece.start && other.end === piece.end) ||
        (other.start === piece.end && other.end === piece.start);
      if (!sameEnds) return false;
      const there = pointOn(other.curve, (other.t0 + other.t1) / 2);
      return Math.hypot(there.x - middle.x, there.y - middle.y) <= merge;
    });
  });

  // Prune dangling ends repeatedly, which also removes chains and stubs on closed shapes.
  let alive = unique.filter((piece) => piece.start !== piece.end || piece.curve.kind !== 'line');
  for (;;) {
    const degree = new Map<number, number>();
    for (const piece of alive) {
      degree.set(piece.start, (degree.get(piece.start) ?? 0) + 1);
      degree.set(piece.end, (degree.get(piece.end) ?? 0) + 1);
    }
    const next = alive.filter(
      (piece) => (degree.get(piece.start) ?? 0) > 1 && (degree.get(piece.end) ?? 0) > 1,
    );
    if (next.length === alive.length) break;
    alive = next;
  }
  if (alive.length === 0) return [];

  const faces = traceFaces(alive, nodes);
  const bounded = faces.filter((face) => face.area > eps);
  const outlines = faces.filter((face) => face.area < -eps);

  const regions = bounded.map((face) => ({ face, holes: [] as Face[] }));
  for (const outer of outlines) {
    const probe = outer.polygon[0];
    if (probe === undefined) continue;
    // The smallest enclosing region from a different connected drawing.
    let best: (typeof regions)[number] | null = null;
    for (const region of regions) {
      if (region.face.component === outer.component) continue;
      if (!inside(region.face.polygon, probe)) continue;
      if (best === null || region.face.area < best.face.area) best = region;
    }
    best?.holes.push(outer);
  }

  return regions.map(({ face, holes }) => ({
    key: [...face.pieces].sort().join('+'),
    loops: [face.segments, ...holes.map((hole) => hole.segments)],
    outline: face.polygon,
    holes: holes.map((hole) => hole.polygon),
    area: face.area + holes.reduce((sum, hole) => sum + hole.area, 0),
  }));
}

/** Bounding box from sampled points, padded to contain the curve's bulge. */
function boxOf(curve: Curve, margin: number): [number, number, number, number] {
  let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const count = curve.kind === 'line' ? 1 : 64;
  for (let k = 0; k <= count; k += 1) {
    const p = pointOn(curve, k / count);
    box = [
      Math.min(box[0], p.x),
      Math.min(box[1], p.y),
      Math.max(box[2], p.x),
      Math.max(box[3], p.y),
    ];
  }
  const slack =
    curve.kind === 'line' ? margin : margin + (box[2] - box[0] + box[3] - box[1]) * 0.01;
  return [box[0] - slack, box[1] - slack, box[2] + slack, box[3] + slack];
}

/** The smallest region containing a point. */
export function regionAt(regions: readonly SketchRegion[], at: Point2): SketchRegion | null {
  let best: SketchRegion | null = null;
  for (const region of regions) {
    if (!inside(region.outline, at)) continue;
    if (region.holes.some((hole) => inside(hole, at))) continue;
    if (best === null || region.area < best.area) best = region;
  }
  return best;
}

// The faces.

interface HalfEdge {
  piece: Piece;
  forward: boolean;
  from: number;
  to: number;
  /** Departure direction from `from`, measured a little way along the curve. */
  angle: number;
  used: boolean;
}

interface Face {
  pieces: string[];
  segments: ProfileSegment[];
  polygon: Point2[];
  area: number;
  component: number;
}

function traceFaces(pieces: readonly Piece[], nodes: readonly Point2[]): Face[] {
  const halves: HalfEdge[] = [];
  const outgoing = new Map<number, HalfEdge[]>();
  for (const piece of pieces) {
    for (const forward of [true, false]) {
      const from = forward ? piece.start : piece.end;
      const to = forward ? piece.end : piece.start;
      const origin = nodes[from] ?? { x: 0, y: 0 };
      const toward = departure(piece, forward);
      const half: HalfEdge = {
        piece,
        forward,
        from,
        to,
        angle: Math.atan2(toward.y - origin.y, toward.x - origin.x),
        used: false,
      };
      halves.push(half);
      const list = outgoing.get(from) ?? [];
      list.push(half);
      outgoing.set(from, list);
    }
  }
  for (const list of outgoing.values()) list.sort((p, q) => p.angle - q.angle);

  const components = connectedComponents(pieces);
  const faces: Face[] = [];
  for (const start of halves) {
    if (start.used) continue;
    const cycle: HalfEdge[] = [];
    let current: HalfEdge | undefined = start;
    let guard = halves.length + 1;
    while (current !== undefined && !current.used && guard-- > 0) {
      current.used = true;
      cycle.push(current);
      current = nextHalf(current, outgoing);
    }
    if (cycle.length === 0 || current !== start) continue;
    const polygon = cycle.flatMap((half) => sample(half.piece, half.forward).slice(0, -1));
    faces.push({
      pieces: cycle.map((half) => half.piece.id),
      segments: wholeCurve(cycle) ?? cycle.map((half) => segmentOf(half.piece, half.forward)),
      polygon,
      area: signedArea(polygon),
      component: components.get(start.piece.id) ?? 0,
    });
  }
  return faces;
}

/**
 * The next half-edge of a face: at the far end, the next one clockwise from the reverse edge.
 * Keeps faces on the left, so regions come out counter-clockwise.
 */
function nextHalf(half: HalfEdge, outgoing: ReadonlyMap<number, HalfEdge[]>): HalfEdge | undefined {
  const around = outgoing.get(half.to);
  if (around === undefined || around.length === 0) return undefined;
  const back = around.findIndex(
    (candidate) => candidate.piece === half.piece && candidate.forward !== half.forward,
  );
  if (back === -1) return undefined;
  return around[(back - 1 + around.length) % around.length];
}

/**
 * Rejoins an uncrossed closed curve that the graph split in two. Two arcs would give a circle
 * extrude a second side face, breaking saved face names. Same for closed splines and ellipses.
 */
function wholeCurve(cycle: readonly HalfEdge[]): ProfileSegment[] | null {
  const first = cycle[0]?.piece.curve;
  if (first === undefined || first.kind === 'line' || !isClosedCurve(first)) return null;
  if (!cycle.every((half) => half.piece.curve === first)) return null;
  const covered = cycle.reduce((sum, half) => sum + (half.piece.t1 - half.piece.t0), 0);
  if (Math.abs(covered - 1) > 1e-9) return null;
  if (first.kind === 'arc')
    return [{ kind: 'circle', center: asProfile(first.center), radius: first.radius }];
  if (first.kind === 'ellipse')
    return [
      {
        kind: 'ellipse',
        center: asProfile(first.center),
        major: asProfile(first.major),
        minor: first.minor,
      },
    ];
  return [{ kind: 'spline', poles: first.poles.map(asProfile) }];
}

function departure(piece: Piece, forward: boolean): Point2 {
  const span = piece.t1 - piece.t0;
  const step = span * 1e-3;
  return pointOn(piece.curve, forward ? piece.t0 + step : piece.t1 - step);
}

function sample(piece: Piece, forward: boolean): Point2[] {
  const span = piece.t1 - piece.t0;
  const count =
    piece.curve.kind === 'line'
      ? 1
      : piece.curve.kind === 'arc'
        ? Math.max(8, Math.ceil(((piece.curve.sweep * span) / TAU) * 64))
        : piece.curve.kind === 'spline'
          ? Math.max(8, Math.ceil(span * ((piece.curve.poles.length - 1) / 3) * 24))
          : Math.max(8, Math.ceil(span * 128));
  const points: Point2[] = [];
  for (let k = 0; k <= count; k += 1) {
    const t = piece.t0 + ((piece.t1 - piece.t0) * k) / count;
    points.push(pointOn(piece.curve, t));
  }
  return forward ? points : points.reverse();
}

function segmentOf(piece: Piece, forward: boolean): ProfileSegment {
  const a = asProfile(pointOn(piece.curve, forward ? piece.t0 : piece.t1));
  const b = asProfile(pointOn(piece.curve, forward ? piece.t1 : piece.t0));
  if (piece.curve.kind === 'line') return { kind: 'line', start: a, end: b };
  if (piece.curve.kind === 'spline') {
    // A closed spline piece may wrap past its start; then it is the two parts on either side.
    const poles =
      piece.t1 <= 1 + 1e-12
        ? bezierChainBetween(piece.curve.poles, piece.t0, Math.min(1, piece.t1))
        : [
            ...bezierChainBetween(piece.curve.poles, piece.t0, 1),
            ...bezierChainBetween(piece.curve.poles, 0, piece.t1 - 1).slice(1),
          ];
    const placed = poles.map(asProfile);
    return { kind: 'spline', poles: forward ? placed : placed.reverse() };
  }
  if (piece.curve.kind === 'ellipse') {
    // Always counter-clockwise.
    return {
      kind: 'ellipse',
      center: asProfile(piece.curve.center),
      major: asProfile(piece.curve.major),
      minor: piece.curve.minor,
      from: TAU * piece.t0,
      sweep: TAU * (piece.t1 - piece.t0),
    };
  }
  if (piece.curve.sweep >= TAU - 1e-12 && piece.t1 - piece.t0 >= 1 - 1e-12) {
    return { kind: 'circle', center: asProfile(piece.curve.center), radius: piece.curve.radius };
  }
  const mid = asProfile(pointOn(piece.curve, (piece.t0 + piece.t1) / 2));
  return { kind: 'arc', start: a, mid, end: b };
}

function asProfile(p: Point2): ProfilePoint {
  return { x: p.x, y: p.y };
}

function signedArea(polygon: readonly Point2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    if (p === undefined || q === undefined) continue;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

function inside(polygon: readonly Point2[], at: Point2): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) {
      result = !result;
    }
  }
  return result;
}

function connectedComponents(pieces: readonly Piece[]): Map<string, number> {
  const parent = new Map<number, number>();
  const find = (n: number): number => {
    let root = n;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(n, root);
    return root;
  };
  for (const piece of pieces) {
    if (!parent.has(piece.start)) parent.set(piece.start, piece.start);
    if (!parent.has(piece.end)) parent.set(piece.end, piece.end);
    const a = find(piece.start);
    const b = find(piece.end);
    if (a !== b) parent.set(a, b);
  }
  const component = new Map<string, number>();
  for (const piece of pieces) component.set(piece.id, find(piece.start));
  return component;
}
