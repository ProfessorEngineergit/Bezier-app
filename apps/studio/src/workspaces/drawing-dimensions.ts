/** Paper-space dimensions, with exact model-space measurements for isometric vertices. */
import type { Vec3 } from '@bezier/kernel';
import type { SheetDimension, SheetView } from './drawing-sheet.js';

export type DimensionKind = NonNullable<SheetDimension['kind']>;
export interface DrawingSnap {
  point: [number, number];
  view: string;
  world?: Vec3;
}
export interface PaperBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export function viewBounds(view: SheetView): PaperBox | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const line of view.lines)
    for (let i = 0; i + 1 < line.points.length; i += 2) {
      const x = line.points[i] ?? 0,
        y = line.points[i + 1] ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
export function snapDrawing(
  layout: SheetView[],
  x: number,
  y: number,
  tolerance: number,
  onlyView?: string,
): DrawingSnap | null {
  let nearest: DrawingSnap | null = null;
  let distance = tolerance;
  for (const view of layout) {
    if (onlyView !== undefined && view.name !== onlyView) continue;
    for (const line of view.lines) {
      if (line.hidden) continue;
      for (const i of [0, line.points.length - 2]) {
        const point: [number, number] = [line.points[i] ?? 0, line.points[i + 1] ?? 0];
        const d = Math.hypot(point[0] - x, point[1] - y);
        if (d >= distance) continue;
        // A projected outline can end at an occlusion rather than a model vertex. Those ends
        // cannot supply a true 3D distance. Coincident vertices choose the frontmost one.
        const vertex = view.vertices
          .filter((v) => Math.hypot(v.point[0] - point[0], v.point[1] - point[1]) < 1e-4)
          .sort((a, b) => b.depth - a.depth)[0];
        if (view.name === 'isometric' && vertex === undefined) continue;
        distance = d;
        nearest = {
          point,
          view: view.name,
          ...(vertex === undefined ? {} : { world: vertex.world }),
        };
      }
    }
  }
  return nearest;
}
export function measuredDimension(
  a: DrawingSnap,
  b: DrawingSnap,
  view: SheetView,
  kind: DimensionKind,
): SheetDimension | null {
  if (a.view !== b.view) return null;
  const dx = b.point[0] - a.point[0],
    dy = b.point[1] - a.point[1];
  let length =
    (kind === 'horizontal'
      ? Math.abs(dx)
      : kind === 'vertical'
        ? Math.abs(dy)
        : Math.hypot(dx, dy)) / view.scale;
  if (view.name === 'isometric') {
    if (a.world === undefined || b.world === undefined || kind !== 'aligned') return null;
    length = Math.hypot(b.world.x - a.world.x, b.world.y - a.world.y, b.world.z - a.world.z);
  }
  if (length < 1e-6) return null;
  return {
    a: a.point,
    b: b.point,
    view: view.name,
    kind,
    measured: length,
    text: Number(length.toFixed(2)).toString(),
  };
}
export function dimensionAxes(d: SheetDimension) {
  const dx = d.b[0] - d.a[0],
    dy = d.b[1] - d.a[1];
  const length = Math.max(1e-9, Math.hypot(dx, dy));
  const ux = d.kind === 'horizontal' ? Math.sign(dx) || 1 : d.kind === 'vertical' ? 0 : dx / length;
  const uy = d.kind === 'horizontal' ? 0 : d.kind === 'vertical' ? Math.sign(dy) || 1 : dy / length;
  return { ux, uy, nx: -uy, ny: ux };
}
export function dimensionGeometry(d: SheetDimension, offset: number) {
  const { ux, uy, nx, ny } = dimensionAxes(d);
  const midX = (d.a[0] + d.b[0]) / 2,
    midY = (d.a[1] + d.b[1]) / 2;
  const projected = (p: [number, number]): [number, number] => {
    const along = (p[0] - midX) * ux + (p[1] - midY) * uy;
    return [midX + ux * along + nx * offset, midY + uy * along + ny * offset];
  };
  const a = projected(d.a),
    b = projected(d.b);
  const tx = midX + nx * offset + ux * (d.along ?? 0),
    ty = midY + ny * offset + uy * (d.along ?? 0);
  let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const textWidth = Math.max(5, d.text.length * 1.95 + 2.4),
    textHeight = 5.4;
  const radians = (angle * Math.PI) / 180;
  const hx =
    (Math.abs(Math.cos(radians)) * textWidth) / 2 + (Math.abs(Math.sin(radians)) * textHeight) / 2;
  const hy =
    (Math.abs(Math.sin(radians)) * textWidth) / 2 + (Math.abs(Math.cos(radians)) * textHeight) / 2;
  return {
    a,
    b,
    tx,
    ty,
    angle,
    textWidth,
    textHeight,
    box: { minX: tx - hx, maxX: tx + hx, minY: ty - hy, maxY: ty + hy },
  };
}
const overlaps = (a: PaperBox, b: PaperBox) =>
  a.minX < b.maxX + 1 && a.maxX > b.minX - 1 && a.minY < b.maxY + 1 && a.maxY > b.minY - 1;
/** Place automatic lanes outside model outlines, view captions and preceding annotations. */
export function layoutDimensions(dimensions: SheetDimension[], views: SheetView[]) {
  const occupied = views.flatMap((v) => {
    const b = viewBounds(v);
    return b === null
      ? []
      : [b, { minX: v.x - 17, maxX: v.x + 17, minY: b.maxY + 5, maxY: b.maxY + 10 }];
  });
  return dimensions.map((d) => {
    const view =
      views.find((v) => v.name === d.view) ??
      views.find((v) => {
        const b = viewBounds(v);
        return (
          b !== null &&
          d.a[0] >= b.minX - 0.5 &&
          d.a[0] <= b.maxX + 0.5 &&
          d.a[1] >= b.minY - 0.5 &&
          d.a[1] <= b.maxY + 0.5
        );
      });
    const { nx, ny } = dimensionAxes(d);
    const sign =
      view &&
      ((d.a[0] + d.b[0]) / 2 - view.x) * nx + (view ? ((d.a[1] + d.b[1]) / 2 - view.y) * ny : 0) < 0
        ? -1
        : 1;
    let offset = d.offset ?? sign * 9;
    let geometry = dimensionGeometry(d, offset);
    if (d.offset === undefined) {
      for (let lane = 0; lane < 80 && occupied.some((box) => overlaps(geometry.box, box)); lane++) {
        offset += sign * 6;
        geometry = dimensionGeometry(d, offset);
      }
    }
    occupied.push(geometry.box);
    return { d, offset, ...geometry };
  });
}
