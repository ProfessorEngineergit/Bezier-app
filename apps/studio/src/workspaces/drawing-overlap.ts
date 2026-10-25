/**
 * Resolves hidden lines that coincide with other lines before a view reaches the sheet.
 *
 * HLR returns every edge once per class, and edges often coincide in projection (a back edge under
 * the front one, a floor edge whole and again in pieces). Overlapping dash patterns out of phase
 * fill each other's gaps and print as solid. A visible line wins over a hidden one (ISO 128-20),
 * and collinear hidden pieces merge into one line with one pattern. Only straight lines are
 * merged and cut, which is where this happens in practice; a curved hidden line is dropped only
 * when every point of it lies on a visible line.
 */

/** Model millimetres; two edges closer than this in projection are the same line on paper. */
const TOLERANCE = 0.01;

interface Straight {
  /** Unit direction, with a fixed sign so a line and its reverse share it. */
  dx: number;
  dy: number;
  /** Signed distance of the line from the origin, along its normal. */
  offset: number;
  from: number;
  to: number;
}

function straight(line: readonly number[]): Straight | null {
  const ax = line[0] ?? 0;
  const ay = line[1] ?? 0;
  const bx = line[line.length - 2] ?? 0;
  const by = line[line.length - 1] ?? 0;
  const length = Math.hypot(bx - ax, by - ay);
  if (length < TOLERANCE) return null;
  let dx = (bx - ax) / length;
  let dy = (by - ay) / length;
  if (dx < -1e-12 || (Math.abs(dx) <= 1e-12 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  const offset = -dy * ax + dx * ay;
  for (let i = 2; i + 3 < line.length; i += 2)
    if (Math.abs(-dy * (line[i] ?? 0) + dx * (line[i + 1] ?? 0) - offset) > TOLERANCE) return null;
  const t0 = dx * ax + dy * ay;
  const t1 = dx * bx + dy * by;
  return { dx, dy, offset, from: Math.min(t0, t1), to: Math.max(t0, t1) };
}

/** Lines whose direction and offset round alike share a bucket. */
function bucket(s: Straight): string {
  return `${Math.round(Math.atan2(s.dy, s.dx) * 1e4)}:${Math.round(s.offset / TOLERANCE)}`;
}

function union(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last[1] + TOLERANCE) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

function subtract(spans: [number, number][], cover: [number, number][]): [number, number][] {
  let rest = spans;
  for (const [cFrom, cTo] of cover) {
    const next: [number, number][] = [];
    for (const [from, to] of rest) {
      if (cTo <= from + TOLERANCE || cFrom >= to - TOLERANCE) next.push([from, to]);
      else {
        if (cFrom - from > TOLERANCE) next.push([from, cFrom]);
        if (to - cTo > TOLERANCE) next.push([cTo, to]);
      }
    }
    rest = next;
  }
  return rest;
}

function distanceToLine(x: number, y: number, line: readonly number[]): number {
  let best = Infinity;
  for (let i = 2; i + 1 < line.length; i += 2) {
    const ax = line[i - 2] ?? 0;
    const ay = line[i - 1] ?? 0;
    const ex = (line[i] ?? 0) - ax;
    const ey = (line[i + 1] ?? 0) - ay;
    const span = ex * ex + ey * ey;
    const t = span > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / span)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * ex, y - ay - t * ey));
  }
  return best;
}

export function settleOverlaps(
  visible: number[][],
  hidden: number[][],
): { visible: number[][]; hidden: number[][] } {
  const covered = new Map<string, [number, number][]>();
  for (const line of visible) {
    const s = straight(line);
    if (s === null) continue;
    const key = bucket(s);
    covered.set(key, [...(covered.get(key) ?? []), [s.from, s.to]]);
  }
  const groups = new Map<string, { line: Straight; spans: [number, number][] }>();
  const curved: number[][] = [];
  for (const line of hidden) {
    const s = straight(line);
    if (s === null) {
      curved.push(line);
      continue;
    }
    const key = bucket(s);
    const group = groups.get(key);
    if (group) group.spans.push([s.from, s.to]);
    else groups.set(key, { line: s, spans: [[s.from, s.to]] });
  }
  const settled: number[][] = [];
  for (const [key, { line, spans }] of groups) {
    const left = subtract(union(spans), union(covered.get(key) ?? []));
    for (const [from, to] of left) {
      if (to - from < TOLERANCE) continue;
      // Back from (along, across) to the sheet's x and y.
      const point = (t: number) => [
        line.dx * t - line.dy * line.offset,
        line.dy * t + line.dx * line.offset,
      ];
      settled.push([...point(from), ...point(to)]);
    }
  }
  // A bounding box per visible line avoids testing every point against every line, which on a
  // thousand-solid assembly is most of the cost.
  const boxes = visible.map((v) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < v.length; i += 2) {
      minX = Math.min(minX, v[i] ?? 0);
      maxX = Math.max(maxX, v[i] ?? 0);
      minY = Math.min(minY, v[i + 1] ?? 0);
      maxY = Math.max(maxY, v[i + 1] ?? 0);
    }
    return {
      v,
      minX: minX - TOLERANCE,
      minY: minY - TOLERANCE,
      maxX: maxX + TOLERANCE,
      maxY: maxY + TOLERANCE,
    };
  });
  for (const line of curved) {
    let onVisible = true;
    for (let i = 0; i + 1 < line.length && onVisible; i += 2) {
      const x = line[i] ?? 0;
      const y = line[i + 1] ?? 0;
      onVisible = boxes.some(
        (b) =>
          x >= b.minX &&
          x <= b.maxX &&
          y >= b.minY &&
          y <= b.maxY &&
          distanceToLine(x, y, b.v) <= TOLERANCE,
      );
    }
    if (!onVisible) settled.push(line);
  }
  return { visible, hidden: settled };
}
