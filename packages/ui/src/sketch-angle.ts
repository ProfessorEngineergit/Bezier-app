/**
 * Measuring, displaying and editing the angle between two sketch lines. The solver's angle is
 * directed from the first line's direction to the second's (planegcs `l2l_angle_ll`), and line
 * direction depends on drawing order, so a visible 45° could read 135° or -45°. The displayed value
 * is the angle between the lines as they leave their shared point; typed values are converted back.
 */

import type { Sketch, SketchConstraint, SketchId, SketchPrimitive } from '@bezier/solver';

type Line = Extract<SketchPrimitive, { kind: 'line' }>;
type Angle = Extract<SketchConstraint, { kind: 'angle' }>;
type Vec = { x: number; y: number };

function pointAt(sketch: Sketch, id: SketchId): Vec | null {
  const found = sketch.primitives.find((primitive) => primitive.id === id);
  return found?.kind === 'point' ? { x: found.x, y: found.y } : null;
}

function lineAt(sketch: Sketch, id: SketchId): Line | null {
  const found = sketch.primitives.find((primitive) => primitive.id === id);
  return found?.kind === 'line' ? found : null;
}

const directed = (u: Vec, v: Vec) => Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);

/** Into (-π, π]. */
function wrap(angle: number): number {
  let a = angle;
  while (a <= -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

interface Frame {
  a: Line;
  b: Line;
  /** The lines oriented away from their shared point, or as drawn if they share none. */
  awayA: Vec;
  awayB: Vec;
  /** Whether exactly one line was reversed, which adds π. */
  flip: boolean;
  /** The end of the second line that stays fixed when the angle changes. */
  pivot: SketchId;
  /** The end of the second line that moves. */
  free: SketchId;
}

function frameOf(sketch: Sketch, aId: SketchId, bId: SketchId): Frame | null {
  const a = lineAt(sketch, aId);
  const b = lineAt(sketch, bId);
  if (a === null || b === null) return null;
  const as = pointAt(sketch, a.start);
  const ae = pointAt(sketch, a.end);
  const bs = pointAt(sketch, b.start);
  const be = pointAt(sketch, b.end);
  if (as === null || ae === null || bs === null || be === null) return null;
  const shared = [a.start, a.end].find((id) => id === b.start || id === b.end) ?? null;
  const reverseA = shared !== null && shared === a.end;
  const reverseB = shared !== null && shared === b.end;
  const along = (from: Vec, to: Vec, reverse: boolean) =>
    reverse ? { x: from.x - to.x, y: from.y - to.y } : { x: to.x - from.x, y: to.y - from.y };
  return {
    a,
    b,
    awayA: along(as, ae, reverseA),
    awayB: along(bs, be, reverseB),
    flip: reverseA !== reverseB,
    pivot: reverseB ? b.end : b.start,
    free: reverseB ? b.start : b.end,
  };
}

/** The solver's directed angle for the lines' current positions. */
export function currentAngle(sketch: Sketch, a: SketchId, b: SketchId): number | null {
  const frame = frameOf(sketch, a, b);
  if (frame === null) return null;
  return wrap(directed(frame.awayA, frame.awayB) + (frame.flip ? Math.PI : 0));
}

/** The visible angle between the lines, in degrees, 0 to 180. */
export function shownDegrees(sketch: Sketch, constraint: Angle): number | null {
  const frame = frameOf(sketch, constraint.a, constraint.b);
  if (frame === null) return null;
  const away = wrap(constraint.valueRadians - (frame.flip ? Math.PI : 0));
  return (Math.abs(away) * 180) / Math.PI;
}

/**
 * Sets an angle constraint to the visible angle `degrees` and rotates the second line about its
 * fixed end to match, so the sketch shows the new angle before solving.
 */
export function withAngle(sketch: Sketch, id: SketchId, degrees: number): Sketch {
  const constraint = sketch.constraints.find(
    (candidate): candidate is Angle => candidate.kind === 'angle' && candidate.id === id,
  );
  if (constraint === undefined || !(degrees > 0) || !(degrees < 180)) return sketch;
  const frame = frameOf(sketch, constraint.a, constraint.b);
  if (frame === null) return sketch;
  // Keep the second line on the same side; only the opening changes.
  const side = Math.sign(wrap(constraint.valueRadians - (frame.flip ? Math.PI : 0))) || 1;
  const away = (side * degrees * Math.PI) / 180;
  const valueRadians = wrap(away + (frame.flip ? Math.PI : 0));

  const pivot = pointAt(sketch, frame.pivot);
  const length = Math.hypot(frame.awayB.x, frame.awayB.y);
  const unitA = Math.hypot(frame.awayA.x, frame.awayA.y);
  const primitives =
    pivot === null || unitA === 0
      ? sketch.primitives
      : sketch.primitives.map((primitive) => {
          if (primitive.id !== frame.free || primitive.kind !== 'point') return primitive;
          const ux = frame.awayA.x / unitA;
          const uy = frame.awayA.y / unitA;
          const c = Math.cos(away);
          const s = Math.sin(away);
          return {
            ...primitive,
            x: pivot.x + (ux * c - uy * s) * length,
            y: pivot.y + (ux * s + uy * c) * length,
          };
        });
  return {
    ...sketch,
    primitives,
    constraints: sketch.constraints.map((candidate) =>
      candidate.id === id ? { ...constraint, valueRadians } : candidate,
    ),
  };
}
