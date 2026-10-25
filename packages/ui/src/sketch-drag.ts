/**
 * Dragging existing sketch geometry with no tool active. The dragged points are fixed at the
 * pointer position for the solve, so the rest of the sketch follows while constraints hold. A
 * position the constraints cannot satisfy is rejected and the sketch stays at its last valid state.
 */

import type { ConstraintSolver, Sketch, SketchId } from '@bezier/solver';
import { solveInto } from './sketch-constraints.js';
import { curveNear } from './sketch-curves.js';
import { pointsOf } from './sketch-id.js';
import { lineNear, type Point2D, pointNear } from './sketch-tools.js';

export interface SketchGrip {
  /** The grabbed element, to select afterwards. */
  target: SketchId;
  /** Points that move with the pointer. */
  points: readonly SketchId[];
}

/** What a press grabs. Points win over lines through them; otherwise the nearer line or curve. */
export function gripAt(sketch: Sketch, at: Point2D, within: number): SketchGrip | null {
  const point = pointNear(sketch, at, within);
  if (point !== null) return { target: point, points: [point] };
  const line = lineNear(sketch, at, within);
  const curve = curveNear(sketch, at, within);
  const hit = line === null || (curve !== null && curve.distance < line.distance) ? curve : line;
  if (hit === null) return null;
  const primitive = sketch.primitives.find((candidate) => candidate.id === hit.id);
  if (primitive === undefined) return null;
  const points = pointsOf(primitive);
  return { target: hit.id, points };
}

/**
 * `base` with the grip's points moved by `delta` and solved; null if the move is impossible (fixed
 * or locked points, or an unsatisfiable sketch). With `solver` null only the points move.
 *
 * Two attempts: first the points are fixed at the pointer, so allowed drags follow it exactly.
 * Dimensions make most positions infeasible (a 10 mm line has one reach), so if that fails the
 * points are released and the solve starts from the pointer position, letting constraints pull them
 * to the nearest valid place (sliding along what blocks them, as in other CAD tools).
 */
export function dragSketch(
  base: Sketch,
  grip: SketchGrip,
  delta: Point2D,
  solver: ConstraintSolver | null,
): Sketch | null {
  const moving = new Set(grip.points);
  for (const primitive of base.primitives)
    if (primitive.kind === 'point' && moving.has(primitive.id) && primitive.fixed === true)
      return null;
  for (const constraint of base.constraints)
    if (constraint.kind === 'lock' && moving.has(constraint.point)) return null;
  const carried = (hold: boolean): Sketch => ({
    ...base,
    primitives: base.primitives.map((primitive) =>
      primitive.kind === 'point' && moving.has(primitive.id)
        ? {
            ...primitive,
            x: primitive.x + delta.u,
            y: primitive.y + delta.v,
            ...(hold ? { fixed: true } : {}),
          }
        : primitive,
    ),
  });
  if (solver === null) return unpin(carried(true), base, moving);
  const held = solveInto(carried(true), solver);
  if (held.ok) return unpin(held.sketch, base, moving);
  const loose = solveInto(carried(false), solver);
  return loose.ok && nearerThanBefore(loose.sketch, base, moving, delta) ? loose.sketch : null;
}

/**
 * Whether no dragged point ended farther from the pointer than it started. The loose solve may
 * produce e.g. a mirror image of the sketch; that is a jump, not a drag, and is rejected.
 */
function nearerThanBefore(
  after: Sketch,
  base: Sketch,
  moving: ReadonlySet<SketchId>,
  delta: Point2D,
): boolean {
  for (const was of base.primitives) {
    if (was.kind !== 'point' || !moving.has(was.id)) continue;
    const now = after.primitives.find((p) => p.kind === 'point' && p.id === was.id);
    if (now === undefined || now.kind !== 'point') return false;
    const hand = { x: was.x + delta.u, y: was.y + delta.v };
    const before = Math.hypot(was.x - hand.x, was.y - hand.y);
    const toHand = Math.hypot(now.x - hand.x, now.y - hand.y);
    if (toHand > before + 1e-9) return false;
  }
  return true;
}

/** Restores the original fixed state of the points held during the solve. */
function unpin(sketch: Sketch, base: Sketch, moving: ReadonlySet<SketchId>): Sketch {
  const was = new Map<SketchId, boolean>();
  for (const primitive of base.primitives)
    if (primitive.kind === 'point' && moving.has(primitive.id) && primitive.fixed !== undefined)
      was.set(primitive.id, primitive.fixed);
  return {
    ...sketch,
    primitives: sketch.primitives.map((primitive) => {
      if (primitive.kind !== 'point' || !moving.has(primitive.id)) return primitive;
      const { fixed: _held, ...rest } = primitive;
      const fixed = was.get(primitive.id);
      return fixed === undefined ? rest : { ...rest, fixed };
    }),
  };
}
