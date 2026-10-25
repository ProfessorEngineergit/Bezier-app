/**
 * Extends a picked edge along tangent-continuous seams (`seams.ts`), e.g. both halves of a circular
 * cut. Seams join when they meet end to end, share a face, and turn by at most 35°.
 *
 * Seam ends are looked up through a spatial index built once per mesh from typed arrays; scanning
 * the faces' seams per step or a `Set` per seam is too slow or too large for hover (ADR 0007).
 */

import { CellTable, type SeamTable, WELD } from './seams.js';

/** Every seam end, found by position. */
export interface EndIndex {
  /** The cell of each end (`seam * 2 + which`). */
  cells: CellTable;
  /** The ends in each cell, cell after cell. */
  starts: Int32Array;
  list: Int32Array;
  /** The side of a cell, and how far apart two ends may be and still be one point. */
  step: number;
  touch: number;
}

/** The sharpest turn a run goes through: cos 35°. */
const SMOOTH = 0.819;
/** However long a run is, it ends here. */
const LONGEST = 6000;

export function indexEnds(table: SeamTable): EndIndex {
  const touch = Math.max(1e-3, (table.weld ?? WELD) * 2);
  const step = touch * 2;
  const count = table.count * 2;
  const cells = new CellTable(Math.max(1024, count));
  const cellOf = new Int32Array(count);
  const e = table.ends;
  let found = 0;
  for (let end = 0; end < count; end++) {
    const i = end * 3;
    const x = Math.round((e[i] ?? 0) / step);
    const y = Math.round((e[i + 1] ?? 0) / step);
    const z = Math.round((e[i + 2] ?? 0) / step);
    let cell = cells.get(x, y, z);
    if (cell < 0) {
      cell = found++;
      cells.set(x, y, z, cell);
    }
    cellOf[end] = cell;
  }
  const starts = new Int32Array(found + 1);
  for (let end = 0; end < count; end++) {
    const cell = cellOf[end] ?? 0;
    starts[cell + 1] = (starts[cell + 1] ?? 0) + 1;
  }
  for (let cell = 0; cell < found; cell++)
    starts[cell + 1] = (starts[cell + 1] ?? 0) + (starts[cell] ?? 0);
  const fill = starts.slice(0, found);
  const list = new Int32Array(count);
  for (let end = 0; end < count; end++) {
    const cell = cellOf[end] ?? 0;
    const at = fill[cell] ?? 0;
    list[at] = end;
    fill[cell] = at + 1;
  }
  return { cells, starts, list, step, touch };
}

/** The seam ends within `touch` of a point, put into `out` (emptied first). */
function endsNear(
  index: EndIndex,
  table: SeamTable,
  x: number,
  y: number,
  z: number,
  out: number[],
): void {
  out.length = 0;
  const { step, touch, cells, starts, list } = index;
  const e = table.ends;
  const fx = x / step;
  const fy = y / step;
  const fz = z / step;
  const px = Math.round(fx);
  const py = Math.round(fy);
  const pz = Math.round(fz);
  // Eight cells: the one the point is in and, on each axis, the neighbour it leans towards.
  const nx = px + (fx >= px ? 1 : -1);
  const ny = py + (fy >= py ? 1 : -1);
  const nz = pz + (fz >= pz ? 1 : -1);
  for (let i = 0; i < 8; i++) {
    const cell = cells.get(i & 1 ? nx : px, i & 2 ? ny : py, i & 4 ? nz : pz);
    if (cell < 0) continue;
    for (let at = starts[cell] ?? 0; at < (starts[cell + 1] ?? 0); at++) {
      const end = list[at] ?? 0;
      const k = end * 3;
      if (Math.hypot((e[k] ?? 0) - x, (e[k + 1] ?? 0) - y, (e[k + 2] ?? 0) - z) < touch)
        out.push(end);
    }
  }
}

/** Whether two seams have a face in common. */
function share(table: SeamTable, a: number, b: number): boolean {
  const fa = table.first[a] ?? -1;
  const sa = table.second[a] ?? -1;
  const fb = table.first[b] ?? -1;
  const sb = table.second[b] ?? -1;
  if (fa === fb || fa === sb) return fa >= 0;
  if (sa >= 0 && (sa === fb || sa === sb)) return true;
  for (const face of table.more.get(a) ?? []) if (face === fb || face === sb) return true;
  for (const face of table.more.get(b) ?? []) if (face === fa || face === sa) return true;
  return false;
}

/** The seams of `seeds` and every seam that carries on from them smoothly. */
export function extendRun(table: SeamTable, index: EndIndex, seeds: readonly number[]): number[] {
  const e = table.ends;
  const run = new Set(seeds);
  const near: number[] = [];

  // The ends nothing else in the run meets: where it can go on.
  const open: number[] = [];
  for (const seam of run) {
    for (const end of [seam * 2, seam * 2 + 1]) {
      const k = end * 3;
      endsNear(index, table, e[k] ?? 0, e[k + 1] ?? 0, e[k + 2] ?? 0, near);
      if (!near.some((other) => other >> 1 !== seam && run.has(other >> 1))) open.push(end);
    }
  }

  while (open.length > 0 && run.size < LONGEST) {
    const here = open.pop() as number;
    const seam = here >> 1;
    const k = here * 3;
    const x = e[k] ?? 0;
    const y = e[k + 1] ?? 0;
    const z = e[k + 2] ?? 0;
    const back = (here ^ 1) * 3;
    // The way the run is heading as it leaves this end.
    let dx = x - (e[back] ?? 0);
    let dy = y - (e[back + 1] ?? 0);
    let dz = z - (e[back + 2] ?? 0);
    const length = Math.hypot(dx, dy, dz);
    if (length === 0) continue;
    dx /= length;
    dy /= length;
    dz /= length;

    endsNear(index, table, x, y, z, near);
    let best = -1;
    let bestCos = SMOOTH;
    for (const end of near) {
      const candidate = end >> 1;
      if (run.has(candidate) || !share(table, seam, candidate)) continue;
      const far = (end ^ 1) * 3;
      let ex = (e[far] ?? 0) - x;
      let ey = (e[far + 1] ?? 0) - y;
      let ez = (e[far + 2] ?? 0) - z;
      const size = Math.hypot(ex, ey, ez);
      if (size === 0) continue;
      ex /= size;
      ey /= size;
      ez /= size;
      const cos = dx * ex + dy * ey + dz * ez;
      if (cos > bestCos) {
        bestCos = cos;
        best = end;
      }
    }
    if (best < 0) continue;
    run.add(best >> 1);
    const far = best ^ 1;
    const f = far * 3;
    // Back at the run itself: a ring, and closed. Otherwise this end is open in its turn.
    endsNear(index, table, e[f] ?? 0, e[f + 1] ?? 0, e[f + 2] ?? 0, near);
    if (!near.some((other) => other >> 1 !== best >> 1 && run.has(other >> 1))) open.push(far);
  }
  return [...run];
}
