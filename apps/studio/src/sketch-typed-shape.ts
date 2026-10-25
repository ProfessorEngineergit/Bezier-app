import type { Sketch } from '@bezier/solver';
import { dimension, typedNumber } from '@bezier/ui';

export interface SketchCursor {
  u: number;
  v: number;
}
export interface RectangleSize {
  axis: 'u' | 'v';
  u: string;
  v: string;
}

export function rectangleTarget(
  from: SketchCursor,
  at: SketchCursor,
  size: RectangleSize,
  centered: boolean,
): SketchCursor {
  const target = { ...at };
  for (const axis of ['u', 'v'] as const) {
    const value = typedNumber(size[axis]) ?? Number.NaN;
    if (size[axis] !== '' && Number.isFinite(value) && value > 0)
      target[axis] = from[axis] + ((at[axis] < from[axis] ? -1 : 1) * value) / (centered ? 2 : 1);
  }
  return target;
}

export function lengthTarget(from: SketchCursor, at: SketchCursor, typed: string): SketchCursor {
  const length = typedNumber(typed) ?? Number.NaN;
  const du = at.u - from.u,
    dv = at.v - from.v;
  const span = Math.hypot(du, dv);
  if (typed === '' || !Number.isFinite(length) || length <= 0 || span < 1e-9) return at;
  return { u: from.u + (du / span) * length, v: from.v + (dv / span) * length };
}

/** Keeps typed values as dimensions after the shape is drawn. */
export function holdTypedDimensions(
  before: Sketch,
  after: Sketch,
  size: RectangleSize | string,
): Sketch {
  const old = new Set(before.primitives.map((p) => p.id));
  const added = after.primitives.filter((p) => !old.has(p.id));
  let next = after;
  if (typeof size === 'string') {
    const value = Number(size);
    const target = added.find((p) => p.kind === 'circle' || p.kind === 'line');
    return size !== '' && value > 0 && Number.isFinite(value) && target
      ? dimension(next, target.id, value)
      : next;
  }
  const points = new Map(after.primitives.filter((p) => p.kind === 'point').map((p) => [p.id, p]));
  const held = new Set<string>();
  for (const line of added) {
    if (line.kind !== 'line') continue;
    const a = points.get(line.start),
      b = points.get(line.end);
    if (!a || !b) continue;
    const axis = Math.abs(a.y - b.y) < 1e-7 ? 'u' : Math.abs(a.x - b.x) < 1e-7 ? 'v' : null;
    if (!axis || held.has(axis)) continue;
    const value = Number(size[axis]);
    if (size[axis] !== '' && value > 0 && Number.isFinite(value)) {
      next = dimension(next, line.id, value);
      held.add(axis);
    }
  }
  return next;
}
