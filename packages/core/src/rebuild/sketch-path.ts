/**
 * A sketch as a sweep path (ADR 0017, audit F-032): lines, arcs and open splines chained end to
 * end. Branching or disconnected sketches are refused.
 */
import type { Profile, ProfileSegment } from '@bezier/kernel';
import type { Sketch, SketchId, SolveResult } from '@bezier/solver';
import { splinePoles } from './curve-math.js';
import type { PlaneBasis } from './plane.js';

type P = { x: number; y: number };
interface Piece {
  from: SketchId;
  to: SketchId;
  /** The segment from `from` to `to`, and reversed. */
  forward: ProfileSegment;
  backward: ProfileSegment;
}

function pieces(sketch: Sketch, at: (id: SketchId) => P | null): Piece[] | string {
  const out: Piece[] = [];
  for (const p of sketch.primitives) {
    if (('construction' in p && p.construction === true) || p.kind === 'point') continue;
    if (p.kind === 'line') {
      const a = at(p.start);
      const b = at(p.end);
      if (a === null || b === null) continue;
      out.push({
        from: p.start,
        to: p.end,
        forward: { kind: 'line', start: a, end: b },
        backward: { kind: 'line', start: b, end: a },
      });
    } else if (p.kind === 'arc') {
      const c = at(p.center);
      const a = at(p.start);
      const b = at(p.end);
      if (c === null || a === null || b === null) continue;
      // Midpoint of the counter-clockwise run from start to end.
      const r = Math.hypot(a.x - c.x, a.y - c.y);
      const from = Math.atan2(a.y - c.y, a.x - c.x);
      let sweep = Math.atan2(b.y - c.y, b.x - c.x) - from;
      if (sweep <= 0) sweep += 2 * Math.PI;
      const mid = {
        x: c.x + r * Math.cos(from + sweep / 2),
        y: c.y + r * Math.sin(from + sweep / 2),
      };
      out.push({
        from: p.start,
        to: p.end,
        forward: { kind: 'arc', start: a, mid, end: b },
        backward: { kind: 'arc', start: b, mid, end: a },
      });
    } else if (p.kind === 'spline') {
      if (p.closed === true) return 'A closed spline is a path on its own; draw it open.';
      const through = p.points.map(at);
      const first = p.points[0];
      const last = p.points[p.points.length - 1];
      if (through.some((q) => q === null) || first === undefined || last === undefined) continue;
      const poles = splinePoles(through as P[], false);
      out.push({
        from: first,
        to: last,
        forward: { kind: 'spline', poles },
        backward: { kind: 'spline', poles: [...poles].reverse() },
      });
    } else {
      return 'A path is made of lines, arcs and splines; leave circles and ellipses out of it.';
    }
  }
  return out;
}

/** The sketch's curves as one chain, or why they are not one. */
export function sketchPath(
  sketch: Sketch,
  solved: SolveResult,
  placement: PlaneBasis,
): Profile | string {
  const found = pieces(sketch, (id) => solved.positions.get(id) ?? null);
  if (typeof found === 'string') return found;
  if (found.length === 0) return 'The path sketch has nothing drawn to follow.';
  const meeting = new Map<SketchId, Piece[]>();
  for (const piece of found)
    for (const end of [piece.from, piece.to])
      meeting.set(end, [...(meeting.get(end) ?? []), piece]);
  if ([...meeting.values()].some((list) => list.length > 2))
    return 'The path branches: three or more of its curves meet at one point.';
  // Start at a free end if there is one.
  const loose = [...meeting.entries()].find(([, list]) => list.length === 1)?.[0];
  let at = loose ?? (found[0] as Piece).from;
  const used = new Set<Piece>();
  const chain: ProfileSegment[] = [];
  for (;;) {
    const next = (meeting.get(at) ?? []).find((piece) => !used.has(piece));
    if (next === undefined) break;
    used.add(next);
    const forward = next.from === at;
    chain.push(forward ? next.forward : next.backward);
    at = forward ? next.to : next.from;
  }
  if (used.size !== found.length) return 'The path falls apart: its curves do not all join up.';
  return {
    loops: [chain],
    origin: placement.origin,
    normal: placement.normal,
    xDirection: placement.xDirection,
  };
}
