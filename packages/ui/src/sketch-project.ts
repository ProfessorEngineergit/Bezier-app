/**
 * Projects face edges into a sketch as geometry to draw against, trim and extrude. The kernel
 * returns edges as sampled polylines (`EdgeSet`); each is reconstructed as a line (two points or
 * straight), circle (closed) or arc through its ends and middle. Faces of parts built in this app
 * have no other edge types.
 */

import type { Sketch, SketchId, SketchPrimitive } from '@bezier/solver';

type P = { x: number; y: number };

const TOLERANCE = 1e-4;

/** The circle through three points, or null when they are in a line. */
function circleThrough(a: P, b: P, c: P): { centre: P; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const centre = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { centre, radius: Math.hypot(a.x - centre.x, a.y - centre.y) };
}

function straight(points: readonly P[]): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return true;
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  if (length < TOLERANCE) return false;
  return points.every(
    (p) =>
      Math.abs((last.x - first.x) * (p.y - first.y) - (last.y - first.y) * (p.x - first.x)) /
        length <
      1e-3,
  );
}

/** Adds `polylines` (plane coordinates) to the sketch as lines, arcs and circles. */
export function projectOutline(sketch: Sketch, polylines: readonly (readonly P[])[]): Sketch {
  const taken = new Set(sketch.primitives.map((primitive) => primitive.id));
  const fresh = (prefix: string): SketchId => {
    let n = 1;
    while (taken.has(`${prefix}${n}`)) n += 1;
    const id = `${prefix}${n}`;
    taken.add(id);
    return id;
  };
  const added: SketchPrimitive[] = [];
  const points: { id: SketchId; x: number; y: number }[] = [];
  // Ends shared by two edges become one point, so the outline is connected.
  const pointAt = (p: P): SketchId => {
    const near = points.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < TOLERANCE);
    if (near !== undefined) return near.id;
    const id = fresh('pp');
    points.push({ id, x: p.x, y: p.y });
    added.push({ kind: 'point', id, x: p.x, y: p.y });
    return id;
  };

  for (const line of polylines) {
    const first = line[0];
    const last = line[line.length - 1];
    if (first === undefined || last === undefined || line.length < 2) continue;
    const closed = Math.hypot(last.x - first.x, last.y - first.y) < TOLERANCE;
    if (closed) {
      const a = line[0];
      const b = line[Math.floor(line.length / 3)];
      const c = line[Math.floor((2 * line.length) / 3)];
      const circle = a && b && c ? circleThrough(a, b, c) : null;
      if (circle === null) continue;
      added.push({
        kind: 'circle',
        id: fresh('pc'),
        center: pointAt(circle.centre),
        radius: circle.radius,
      });
      continue;
    }
    if (straight(line)) {
      added.push({ kind: 'line', id: fresh('pl'), start: pointAt(first), end: pointAt(last) });
      continue;
    }
    const middle = line[Math.floor(line.length / 2)];
    const circle = middle === undefined ? null : circleThrough(first, middle, last);
    if (circle === null || middle === undefined) continue;
    // Arcs are stored counter-clockwise from start to end. If the arc's middle lies left of the
    // chord from `first`, the edge runs clockwise and its ends are swapped.
    const side =
      (last.x - first.x) * (middle.y - first.y) - (last.y - first.y) * (middle.x - first.x);
    const [start, end] = side < 0 ? [first, last] : [last, first];
    added.push({
      kind: 'arc',
      id: fresh('pa'),
      center: pointAt(circle.centre),
      start: pointAt(start),
      end: pointAt(end),
    });
  }
  return added.length === 0 ? sketch : { ...sketch, primitives: [...sketch.primitives, ...added] };
}
