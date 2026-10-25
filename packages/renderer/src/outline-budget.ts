/**
 * Thins an import preview's outline so its animated sweep stays cheap (a large assembly has
 * 288 000 polylines). Keeps the longest polylines up to a segment budget, each reduced to a few
 * points.
 */

import type { EdgeSet } from '@bezier/kernel';

/** Line segments drawn for the preview at most. */
export const OUTLINE_SEGMENTS = 40_000;
/** Points one polyline keeps at most; a curve of this many still reads as round. */
const POINTS_PER_LINE = 12;

/** `edges`, cut down to about `budget` segments; returned as it is when already within it. */
export function thinEdges(edges: EdgeSet, budget: number = OUTLINE_SEGMENTS): EdgeSet {
  const { positions, polylineStarts: starts } = edges;
  const lines = starts.length;
  const start = (i: number) => (starts[i] ?? 0) / 3;
  const end = (i: number) => (i + 1 < lines ? (starts[i + 1] ?? 0) : positions.length) / 3;

  let segments = 0;
  for (let i = 0; i < lines; i++) segments += Math.max(0, end(i) - start(i) - 1);
  if (segments <= budget) return edges;

  // How far each polyline runs, end to end, longest first.
  const reach = new Float32Array(lines);
  for (let i = 0; i < lines; i++) {
    const a = start(i) * 3;
    const b = (end(i) - 1) * 3;
    reach[i] = Math.hypot(
      (positions[b] ?? 0) - (positions[a] ?? 0),
      (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0),
      (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0),
    );
  }
  const order = Array.from({ length: lines }, (_, i) => i).sort(
    (x, y) => (reach[y] ?? 0) - (reach[x] ?? 0),
  );

  const kept: number[] = [];
  const stride = (points: number) => Math.max(1, Math.ceil((points - 1) / (POINTS_PER_LINE - 1)));
  let used = 0;
  for (const i of order) {
    const points = end(i) - start(i);
    if (points < 2) continue;
    const cost = Math.ceil((points - 1) / stride(points));
    if (used + cost > budget) break;
    used += cost;
    kept.push(i);
  }

  const out = new Float32Array((used + kept.length) * 3);
  const outStarts = new Uint32Array(kept.length);
  let at = 0;
  kept.forEach((i, k) => {
    outStarts[k] = at;
    const from = start(i);
    const last = end(i) - 1;
    const step = stride(last - from + 1);
    for (let p = from; p < last; p += step) {
      out.set(positions.subarray(p * 3, p * 3 + 3), at);
      at += 3;
    }
    out.set(positions.subarray(last * 3, last * 3 + 3), at);
    at += 3;
  });
  return { positions: out.subarray(0, at), polylineStarts: outStarts };
}
