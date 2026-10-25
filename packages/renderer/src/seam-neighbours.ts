/**
 * Pairs border edges across faces that were tessellated separately. `buildSeams` matches edges by
 * their endpoints, but OCCT re-meshes only the faces an operation changed (or a refined part), so
 * neighbours can split their common curve at different points. Unmatched border edges are paired
 * with the face whose unmatched border runs within `REACH` along their length.
 */

import type { SeamTable } from './seams.js';

/**
 * How far apart two tessellations of one curve can lie, in millimetres. Each is within its own
 * deflection of the curve, and the coarsest setting draws to 0.25 mm.
 */
const REACH = 0.3;
/** The grid the lonely edges are filed on, a little wider than the reach. */
const CELL = 1;
/** Points taken along one edge when it is filed, at most. A long edge is filed more coarsely. */
const MOST_SAMPLES = 48;
/** Above this many lonely edges the mesh is not one this is for, and the pass is skipped. */
const MOST_EDGES = 400_000;

const key = (x: number, y: number, z: number) =>
  `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;

function distanceToSegment(
  px: number,
  py: number,
  pz: number,
  ends: Float32Array,
  at: number,
): number {
  const ax = ends[at] ?? 0;
  const ay = ends[at + 1] ?? 0;
  const az = ends[at + 2] ?? 0;
  const dx = (ends[at + 3] ?? 0) - ax;
  const dy = (ends[at + 4] ?? 0) - ay;
  const dz = (ends[at + 5] ?? 0) - az;
  const length2 = dx * dx + dy * dy + dz * dz;
  const t =
    length2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / length2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t), pz - (az + dz * t));
}

/** Give every border edge that has no face across it the face whose border runs along it. */
export function pairLooseBorders(table: SeamTable): void {
  const { ends, first, second } = table;
  const loose: number[] = [];
  for (let seam = 0; seam < table.count; seam++) if ((second[seam] ?? -1) < 0) loose.push(seam);
  if (loose.length < 2 || loose.length > MOST_EDGES) return;

  // File each lonely edge under every cell it passes through.
  const cells = new Map<string, number[]>();
  for (const seam of loose) {
    const at = seam * 6;
    const ax = ends[at] ?? 0;
    const ay = ends[at + 1] ?? 0;
    const az = ends[at + 2] ?? 0;
    const dx = (ends[at + 3] ?? 0) - ax;
    const dy = (ends[at + 4] ?? 0) - ay;
    const dz = (ends[at + 5] ?? 0) - az;
    const steps = Math.min(
      MOST_SAMPLES,
      Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / (CELL / 2))),
    );
    let last = '';
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cell = key(ax + dx * t, ay + dy * t, az + dz * t);
      if (cell === last) continue;
      last = cell;
      const filed = cells.get(cell);
      if (filed === undefined) cells.set(cell, [seam]);
      else if (filed[filed.length - 1] !== seam) filed.push(seam);
    }
  }

  // Decide all pairings before writing any, so one does not hide another.
  const found = new Int32Array(loose.length).fill(-1);
  const votes = new Map<number, number>();
  loose.forEach((seam, index) => {
    const at = seam * 6;
    const face = first[seam] ?? -1;
    votes.clear();
    // Three points along it, so a neighbour must run beside the edge, not just touch its end.
    for (const t of [0.25, 0.5, 0.75]) {
      const px = (ends[at] ?? 0) + ((ends[at + 3] ?? 0) - (ends[at] ?? 0)) * t;
      const py = (ends[at + 1] ?? 0) + ((ends[at + 4] ?? 0) - (ends[at + 1] ?? 0)) * t;
      const pz = (ends[at + 2] ?? 0) + ((ends[at + 5] ?? 0) - (ends[at + 2] ?? 0)) * t;
      const near = new Set<number>();
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++)
            for (const other of cells.get(key(px + ox * CELL, py + oy * CELL, pz + oz * CELL)) ??
              []) {
              const across = first[other] ?? -1;
              if (across === face || near.has(across)) continue;
              if (distanceToSegment(px, py, pz, ends, other * 6) <= REACH) near.add(across);
            }
      for (const across of near) votes.set(across, (votes.get(across) ?? 0) + 1);
    }
    for (const [across, count] of votes) if (count === 3) found[index] = across;
  });
  loose.forEach((seam, index) => {
    const across = found[index] ?? -1;
    if (across >= 0) second[seam] = across;
  });
}
