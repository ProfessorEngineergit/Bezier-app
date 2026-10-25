/** Clip projected curves geometrically so every exporter receives the same detail view. */
import type { DrawingProjection } from '@bezier/kernel';
export function detailView(
  source: DrawingProjection,
  cx: number,
  cy: number,
  radius: number,
): DrawingProjection {
  const clip = (lines: number[][]) =>
    lines.flatMap((points) => {
      const result: number[][] = [];
      for (let i = 0; i + 3 < points.length; i += 2) {
        const x = points[i] ?? 0;
        const y = points[i + 1] ?? 0;
        const dx = (points[i + 2] ?? 0) - x;
        const dy = (points[i + 3] ?? 0) - y;
        const a = dx * dx + dy * dy;
        if (a < 1e-12) continue;
        const b = 2 * ((x - cx) * dx + (y - cy) * dy);
        const c = (x - cx) ** 2 + (y - cy) ** 2 - radius ** 2;
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) continue;
        const lo = Math.max(0, (-b - Math.sqrt(discriminant)) / (2 * a));
        const hi = Math.min(1, (-b + Math.sqrt(discriminant)) / (2 * a));
        if (hi > lo)
          result.push([
            (x + lo * dx - cx) * 2,
            (y + lo * dy - cy) * 2,
            (x + hi * dx - cx) * 2,
            (y + hi * dy - cy) * 2,
          ]);
      }
      return result;
    });
  return { direction: 'detail', visible: clip(source.visible), hidden: clip(source.hidden) };
}
/** Even/odd intersections keep holes in the section without relying on SVG raster patterns. */
export function hatchSection(lines: number[][]): number[][] {
  const segments: [number, number, number, number][] = [];
  let low = Infinity;
  let high = -Infinity;
  for (const points of lines)
    for (let i = 0; i + 3 < points.length; i += 2) {
      const x = points[i] ?? 0;
      const y = points[i + 1] ?? 0;
      const x2 = points[i + 2] ?? 0;
      const y2 = points[i + 3] ?? 0;
      segments.push([x, y, x2, y2]);
      low = Math.min(low, y - x, y2 - x2);
      high = Math.max(high, y - x, y2 - x2);
    }
  const result: number[][] = [];
  const step = Math.max(2, (high - low) / 300);
  for (let v = Math.ceil(low / step) * step; v < high; v += step) {
    const hits: number[] = [];
    for (const [x, y, x2, y2] of segments) {
      const a = y - x;
      const b = y2 - x2;
      if ((a <= v && b > v) || (b <= v && a > v)) hits.push(x + ((x2 - x) * (v - a)) / (b - a));
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const a = hits[i] ?? 0;
      const b = hits[i + 1] ?? 0;
      if (b - a > 1e-6) result.push([a, a + v, b, b + v]);
    }
  }
  return result;
}
