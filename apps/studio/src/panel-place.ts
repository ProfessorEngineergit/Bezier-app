/**
 * Where a floating panel (Measure, Section, an image) may go: inside the stage, never over the
 * permanent controls (rails, Items button, lower-right menu) or flyouts and view panels opened from
 * them (audit D3). Near one, it snaps to exactly one `GAP` away so it lines up. The view cube is
 * not an obstacle; panels may pass under it. Pure, in stage pixels, for tests.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Gap kept to every control and to the stage edges. */
export const GAP = 8;
/** Distance in pixels within which a dragged panel snaps to an edge or control. */
export const REACH = 18;

const right = (b: Box) => b.left + b.width;
const bottom = (b: Box) => b.top + b.height;

function overlaps(a: Box, b: Box, gap: number): boolean {
  return (
    a.left < right(b) + gap &&
    right(a) + gap > b.left &&
    a.top < bottom(b) + gap &&
    bottom(a) + gap > b.top
  );
}

/** Clamps into the stage with a gap; a panel larger than the stage keeps its top left. */
function inside(panel: Box, stage: { width: number; height: number }): Box {
  const left = Math.max(GAP, Math.min(panel.left, stage.width - panel.width - GAP));
  const top = Math.max(GAP, Math.min(panel.top, stage.height - panel.height - GAP));
  return { ...panel, left, top };
}

/**
 * Moves `panel` the shortest way out of every obstacle it overlaps or is within `GAP` of. Each
 * obstacle offers four exits; the nearest that stays in the stage and clears the others wins, else
 * the nearest that stays in the stage. A few rounds settle chains of obstacles.
 */
export function keepClear(
  panel: Box,
  stage: { width: number; height: number },
  obstacles: readonly Box[],
): Box {
  let at = inside(panel, stage);
  for (let round = 0; round < 4; round++) {
    const hit = obstacles.find((o) => overlaps(at, o, GAP));
    if (hit === undefined) return at;
    const ways: Box[] = [
      { ...at, left: hit.left - GAP - at.width },
      { ...at, left: right(hit) + GAP },
      { ...at, top: hit.top - GAP - at.height },
      { ...at, top: bottom(hit) + GAP },
    ];
    const fits = (b: Box) =>
      b.left >= GAP - 0.5 &&
      b.top >= GAP - 0.5 &&
      right(b) <= stage.width - GAP + 0.5 &&
      bottom(b) <= stage.height - GAP + 0.5;
    const cost = (b: Box) => Math.abs(b.left - at.left) + Math.abs(b.top - at.top);
    const inStage = ways.filter(fits).sort((a, b) => cost(a) - cost(b));
    const clear = inStage.find((b) => !obstacles.some((o) => overlaps(b, o, GAP)));
    const next = clear ?? inStage[0];
    if (next === undefined) return at;
    at = next;
  }
  return at;
}

/**
 * While dragging: snaps to a stage edge within reach, to a control's side, or level with a
 * control's top or bottom.
 */
export function drawIn(
  panel: Box,
  stage: { width: number; height: number },
  obstacles: readonly Box[],
): Box {
  let { left, top } = panel;
  const xs: number[] = [GAP, stage.width - GAP - panel.width];
  const ys: number[] = [GAP, stage.height - GAP - panel.height];
  for (const o of obstacles) {
    const besideY = panel.top < bottom(o) + REACH && bottom(panel) > o.top - REACH;
    const besideX = panel.left < right(o) + REACH && right(panel) > o.left - REACH;
    if (besideY) {
      xs.push(right(o) + GAP, o.left - GAP - panel.width);
      ys.push(o.top, bottom(o) - panel.height);
    }
    if (besideX) {
      ys.push(bottom(o) + GAP, o.top - GAP - panel.height);
      xs.push(o.left, right(o) - panel.width);
    }
  }
  const nearest = (value: number, candidates: readonly number[]) => {
    let best = value;
    let distance = REACH + 1;
    for (const c of candidates) {
      const d = Math.abs(c - value);
      if (d <= REACH && d < distance) {
        best = c;
        distance = d;
      }
    }
    return best;
  };
  left = nearest(left, xs);
  top = nearest(top, ys);
  return { ...panel, left, top };
}

/** New size from dragging a corner by (dx, dy), clamped to a minimum size and the stage. */
export function resizeFrom(
  start: Box,
  corner: 'nw' | 'ne' | 'sw' | 'se',
  dx: number,
  dy: number,
  stage: { width: number; height: number },
  least: { width: number; height: number },
): Box {
  let { left, top, width, height } = start;
  if (corner === 'ne' || corner === 'se') width = start.width + dx;
  else {
    width = start.width - dx;
    left = start.left + dx;
  }
  if (corner === 'sw' || corner === 'se') height = start.height + dy;
  else {
    height = start.height - dy;
    top = start.top + dy;
  }
  // The opposite edge stays put when the minimum size or the stage stops this one.
  if (width < least.width) {
    if (corner === 'nw' || corner === 'sw') left -= least.width - width;
    width = least.width;
  }
  if (height < least.height) {
    if (corner === 'nw' || corner === 'ne') top -= least.height - height;
    height = least.height;
  }
  if (left < GAP) {
    width -= GAP - left;
    left = GAP;
  }
  if (top < GAP) {
    height -= GAP - top;
    top = GAP;
  }
  width = Math.min(width, stage.width - GAP - left);
  height = Math.min(height, stage.height - GAP - top);
  return { left, top, width, height };
}
