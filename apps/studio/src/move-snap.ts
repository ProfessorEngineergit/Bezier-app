/**
 * Snapping while moving a body or image (audit C1): the moved box snaps to the faces, edges and
 * centres of other bodies or to a grid, whichever is nearest within a few pixels. The grid step
 * scales with zoom so it stays roughly constant on screen. Pure and in world millimetres for tests.
 */

export type Vec = readonly [number, number, number];

export interface Box {
  min: Vec;
  max: Vec;
}

/** What a feature of the moved box snapped to, for the label beside the handle. */
export interface SnapHit {
  axis: 0 | 1 | 2;
  /** Which part of the moved box: its low side, middle or high side. */
  feature: 'min' | 'mid' | 'max';
  /** What it snapped to: another body's side or middle, or the grid. */
  target: 'face' | 'middle' | 'grid';
  /** The coordinate it snapped to. */
  at: number;
  /** The index of the other box, for a face or a middle. */
  other?: number;
}

export interface Snapped {
  delta: [number, number, number];
  hits: SnapHit[];
}

/** Grid steps worth offering, in millimetres. */
const STEPS = [0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000] as const;

/** Snap reach in pixels, and the smallest grid line spacing worth drawing. */
export const REACH_PX = 8;
const GRID_PX = 14;

/** The grid step for a zoom: the finest step whose lines are at least a hand's width apart. */
export function gridStepFor(worldPerPixel: number): number {
  const wanted = worldPerPixel * GRID_PX;
  return STEPS.find((step) => step >= wanted) ?? STEPS[STEPS.length - 1] ?? 1000;
}

/** The box moved by `delta`. */
export function shifted(box: Box, delta: Vec): Box {
  return {
    min: [box.min[0] + delta[0], box.min[1] + delta[1], box.min[2] + delta[2]],
    max: [box.max[0] + delta[0], box.max[1] + delta[1], box.max[2] + delta[2]],
  };
}

/**
 * The snapped delta for the delta the pointer asked for. `free` gives the axes the gesture moves
 * along (one for an arrow, two for a plane); the others are untouched.
 */
export function snapDelta(input: {
  moving: Box;
  others: readonly Box[];
  delta: Vec;
  free: readonly [boolean, boolean, boolean];
  /** World millimetres per pixel at the part. */
  worldPerPixel: number;
  /** False: boxes only, no grid (the gesture already rounds). */
  grid?: boolean;
}): Snapped {
  const { moving, others, delta, free, worldPerPixel } = input;
  const reach = worldPerPixel * REACH_PX;
  const step = gridStepFor(worldPerPixel);
  const out: [number, number, number] = [delta[0], delta[1], delta[2]];
  const hits: SnapHit[] = [];

  for (const axis of [0, 1, 2] as const) {
    if (!free[axis]) continue;
    const sides = {
      min: moving.min[axis] + delta[axis],
      mid: (moving.min[axis] + moving.max[axis]) / 2 + delta[axis],
      max: moving.max[axis] + delta[axis],
    };
    let best: { gap: number; shift: number; hit: SnapHit } | null = null;
    const consider = (
      feature: SnapHit['feature'],
      at: number,
      target: SnapHit['target'],
      other?: number,
    ) => {
      const gap = at - sides[feature];
      if (Math.abs(gap) > reach) return;
      // At equal distance a face of another body beats the grid.
      const weight = Math.abs(gap) + (target === 'grid' ? reach * 0.25 : 0);
      if (
        best === null ||
        weight < Math.abs(best.gap) + (best.hit.target === 'grid' ? reach * 0.25 : 0)
      )
        best = {
          gap: gap,
          shift: gap,
          hit: { axis, feature, target, at, ...(other === undefined ? {} : { other }) },
        };
    };
    others.forEach((box, index) => {
      const lo = box.min[axis];
      const hi = box.max[axis];
      // All nine side/middle pairings; low side against high side (standing against it) is the
      // common one.
      for (const feature of ['min', 'mid', 'max'] as const) {
        consider(feature, lo, 'face', index);
        consider(feature, hi, 'face', index);
        consider(feature, (lo + hi) / 2, 'middle', index);
      }
    });
    if (input.grid !== false) {
      for (const feature of ['min', 'max'] as const) {
        const at = Math.round(sides[feature] / step) * step;
        consider(feature, at, 'grid');
      }
    }
    if (best !== null) {
      const found: { shift: number; hit: SnapHit } = best;
      out[axis] = delta[axis] + found.shift;
      hits.push(found.hit);
    }
  }
  return { delta: out, hits };
}

/** A short label for the snap target, shown beside the handle. */
export function describeHit(hit: SnapHit, names: readonly string[]): string {
  const axis = ['X', 'Y', 'Z'][hit.axis];
  if (hit.target === 'grid') return `${axis} on the grid`;
  const name = hit.other === undefined ? 'another body' : (names[hit.other] ?? 'another body');
  return `${axis} to ${hit.target === 'middle' ? 'the middle of' : 'a side of'} ${name}`;
}
