/**
 * Fillet or chamfer the corner of two sketch lines: both are trimmed back by the same distance and
 * joined by a tangent arc (fillet) or a line (chamfer). The corner point and the constraints that
 * referenced it are removed.
 */

import type { Sketch, SketchConstraint, SketchId, SketchPrimitive } from '@bezier/solver';

type Line = Extract<SketchPrimitive, { kind: 'line' }>;
type P = { x: number; y: number };

export type CornerResult = { ok: true; sketch: Sketch } | { ok: false; message: string };

function pointAt(sketch: Sketch, id: SketchId): P | null {
  const found = sketch.primitives.find((primitive) => primitive.id === id);
  return found?.kind === 'point' ? { x: found.x, y: found.y } : null;
}

function names(constraint: SketchConstraint, id: SketchId): boolean {
  return Object.values(constraint).includes(id);
}

/** Fillets (`radius`) or chamfers (`distance`) the corner shared by the two selected lines. */
export function roundCorner(
  sketch: Sketch,
  selected: readonly SketchId[],
  style: 'fillet' | 'chamfer',
  size: number,
): CornerResult {
  const lines = selected
    .map((id) => sketch.primitives.find((primitive) => primitive.id === id))
    .filter((primitive): primitive is Line => primitive?.kind === 'line');
  const [a, b] = lines;
  if (lines.length !== 2 || a === undefined || b === undefined) {
    return { ok: false, message: 'Select the two lines that meet at the corner.' };
  }
  const corner = [a.start, a.end].find((id) => id === b.start || id === b.end);
  if (corner === undefined) return { ok: false, message: 'Those two lines do not meet.' };
  const p = pointAt(sketch, corner);
  const far = (line: Line) => pointAt(sketch, line.start === corner ? line.end : line.start);
  const fa = far(a);
  const fb = far(b);
  if (p === null || fa === null || fb === null || !(size > 0)) {
    return { ok: false, message: 'That corner cannot be rounded.' };
  }
  const la = Math.hypot(fa.x - p.x, fa.y - p.y);
  const lb = Math.hypot(fb.x - p.x, fb.y - p.y);
  const ua = { x: (fa.x - p.x) / la, y: (fa.y - p.y) / la };
  const ub = { x: (fb.x - p.x) / lb, y: (fb.y - p.y) / lb };
  const angle = Math.acos(Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y)));
  if (angle < 1e-3 || Math.PI - angle < 1e-3) {
    return { ok: false, message: 'Those lines run straight on; there is no corner to round.' };
  }
  const back = style === 'fillet' ? size / Math.tan(angle / 2) : size;
  if (back >= la || back >= lb) {
    return { ok: false, message: `A ${size} mm ${style} does not fit on those lines.` };
  }

  const taken = new Set(sketch.primitives.map((primitive) => primitive.id));
  const fresh = (prefix: string): SketchId => {
    let n = 1;
    while (taken.has(`${prefix}${n}`)) n += 1;
    taken.add(`${prefix}${n}`);
    return `${prefix}${n}`;
  };
  const ta = { x: p.x + ua.x * back, y: p.y + ua.y * back };
  const tb = { x: p.x + ub.x * back, y: p.y + ub.y * back };
  const idA = fresh('cp');
  const idB = fresh('cp');
  const added: SketchPrimitive[] = [
    { kind: 'point', id: idA, x: ta.x, y: ta.y },
    { kind: 'point', id: idB, x: tb.x, y: tb.y },
  ];
  if (style === 'chamfer') {
    added.push({ kind: 'line', id: fresh('cl'), start: idA, end: idB });
  } else {
    const bisector = { x: ua.x + ub.x, y: ua.y + ub.y };
    const length = Math.hypot(bisector.x, bisector.y);
    const out = size / Math.sin(angle / 2);
    const centre = { x: p.x + (bisector.x / length) * out, y: p.y + (bisector.y / length) * out };
    const idC = fresh('cp');
    added.push({ kind: 'point', id: idC, x: centre.x, y: centre.y });
    // The arc bulges toward the old corner. Stored counter-clockwise: from `ta` when the corner
    // lies to the right of the chord ta→tb, else from `tb`.
    const side = (tb.x - ta.x) * (p.y - ta.y) - (tb.y - ta.y) * (p.x - ta.x);
    const [start, end] = side < 0 ? [idA, idB] : [idB, idA];
    added.push({ kind: 'arc', id: fresh('ca'), center: idC, start, end });
  }

  const moveEnd = (line: Line, to: SketchId): Line =>
    line.start === corner ? { ...line, start: to } : { ...line, end: to };
  const stillUsed = (primitive: SketchPrimitive) =>
    primitive.id !== a.id &&
    primitive.id !== b.id &&
    primitive.kind !== 'point' &&
    Object.values(primitive).includes(corner);
  const keepCorner = sketch.primitives.some(stillUsed);
  const primitives = sketch.primitives
    .filter((primitive) => keepCorner || primitive.id !== corner)
    .map((primitive) =>
      primitive.id === a.id ? moveEnd(a, idA) : primitive.id === b.id ? moveEnd(b, idB) : primitive,
    );
  return {
    ok: true,
    sketch: {
      primitives: [...primitives, ...added],
      // The corner point is gone, and so are lengths measured to it.
      constraints: sketch.constraints.filter((constraint) => !names(constraint, corner)),
    },
  };
}
