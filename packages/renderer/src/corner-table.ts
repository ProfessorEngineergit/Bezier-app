/**
 * A mesh's corners (points where three or more faces meet) and the corners on each face, built from
 * the seams in typed arrays so the geometry worker can transfer them (`geometry-worker.ts`). Seam
 * ends are bucketed by rounding (`WELD`); a cell with three or more faces is a corner, at its first
 * end.
 */

import { CellTable, type SeamTable, WELD } from './seams.js';

export interface CornerTable {
  count: number;
  /** xyz per corner. */
  points: Float32Array;
  /**
   * The faces of corner `c` are `faces[faceStarts[c]] … faces[faceStarts[c + 1] - 1]`, ascending.
   */
  faceStarts: Uint32Array;
  faces: Int32Array;
  /** The corners on face `f` are `byFace[byFaceStarts[f]] … byFace[byFaceStarts[f + 1] - 1]`. */
  byFaceStarts: Uint32Array;
  byFace: Uint32Array;
}

export function buildCorners(table: SeamTable): CornerTable {
  const ends = table.count * 2;
  const cells = new CellTable(ends);
  const cellOf = new Int32Array(ends);
  const firstEnd: number[] = [];
  let found = 0;
  const e = table.ends;
  const weld = table.weld ?? WELD;
  for (let end = 0; end < ends; end++) {
    const i = end * 3;
    const x = Math.round((e[i] ?? 0) / weld);
    const y = Math.round((e[i + 1] ?? 0) / weld);
    const z = Math.round((e[i + 2] ?? 0) / weld);
    let cell = cells.get(x, y, z);
    if (cell < 0) {
      cell = found++;
      cells.set(x, y, z, cell);
      firstEnd.push(end);
    }
    cellOf[end] = cell;
  }

  // The faces at each cell, laid out cell after cell.
  const starts = new Uint32Array(found + 1);
  const count = (seam: number) =>
    1 + ((table.second[seam] ?? -1) >= 0 ? 1 : 0) + (table.more.get(seam)?.length ?? 0);
  for (let end = 0; end < ends; end++) {
    const cell = cellOf[end] ?? 0;
    starts[cell + 1] = (starts[cell + 1] ?? 0) + count(end >> 1);
  }
  for (let c = 1; c <= found; c++) starts[c] = (starts[c] ?? 0) + (starts[c - 1] ?? 0);
  const at = starts.slice(0, found);
  const facesAtCells = new Int32Array(starts[found] ?? 0);
  const put = (cell: number, face: number) => {
    const index = at[cell] ?? 0;
    facesAtCells[index] = face;
    at[cell] = index + 1;
  };
  for (let end = 0; end < ends; end++) {
    const cell = cellOf[end] ?? 0;
    const seam = end >> 1;
    put(cell, table.first[seam] ?? -1);
    const second = table.second[seam] ?? -1;
    if (second >= 0) put(cell, second);
    for (const face of table.more.get(seam) ?? []) put(cell, face);
  }

  // The cells three different faces meet in, each with its faces once and in order.
  const points: number[] = [];
  const faceStarts: number[] = [0];
  const faces: number[] = [];
  let faceCount = 0;
  for (let cell = 0; cell < found; cell++) {
    const run = facesAtCells.subarray(starts[cell] ?? 0, starts[cell + 1] ?? 0);
    // Most cells are the two faces of one seam, seen from both of its ends.
    if (run.length < 3) continue;
    const unique = [...new Set(run)].sort((a, b) => a - b);
    if (unique.length < 3) continue;
    const i = (firstEnd[cell] ?? 0) * 3;
    points.push(e[i] ?? 0, e[i + 1] ?? 0, e[i + 2] ?? 0);
    for (const face of unique) {
      faces.push(face);
      if (face + 1 > faceCount) faceCount = face + 1;
    }
    faceStarts.push(faces.length);
  }

  // For each face, the corners on it.
  const corners = faceStarts.length - 1;
  const byFaceStarts = new Uint32Array(faceCount + 1);
  for (const face of faces)
    if (face >= 0) byFaceStarts[face + 1] = (byFaceStarts[face + 1] ?? 0) + 1;
  for (let f = 1; f <= faceCount; f++)
    byFaceStarts[f] = (byFaceStarts[f] ?? 0) + (byFaceStarts[f - 1] ?? 0);
  const byFace = new Uint32Array(byFaceStarts[faceCount] ?? 0);
  const next = byFaceStarts.slice(0, faceCount);
  for (let corner = 0; corner < corners; corner++) {
    for (let k = faceStarts[corner] ?? 0; k < (faceStarts[corner + 1] ?? 0); k++) {
      const face = faces[k] ?? -1;
      if (face < 0) continue;
      const index = next[face] ?? 0;
      byFace[index] = corner;
      next[face] = index + 1;
    }
  }

  return {
    count: corners,
    points: Float32Array.from(points),
    faceStarts: Uint32Array.from(faceStarts),
    faces: Int32Array.from(faces),
    byFaceStarts,
    byFace,
  };
}

/** The buffers of a table, for handing it to another thread without a copy. */
export function cornerBuffers(table: CornerTable): ArrayBuffer[] {
  return [
    table.points.buffer,
    table.faceStarts.buffer,
    table.faces.buffer,
    table.byFaceStarts.buffer,
    table.byFace.buffer,
  ] as ArrayBuffer[];
}
