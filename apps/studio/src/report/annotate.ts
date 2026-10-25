/**
 * Report screenshot annotations: pen, box and arrow. Shapes are stored with their points, so the
 * picture is redrawn from the screenshot each time and Undo removes the last shape.
 */

export type Tool = 'pen' | 'box' | 'arrow';
export interface Point {
  x: number;
  y: number;
}
export interface Shape {
  tool: Tool;
  points: Point[];
}

export const INK = '#ff375f';

function pen(g: CanvasRenderingContext2D, points: readonly Point[]): void {
  const [first, ...rest] = points;
  if (first === undefined) return;
  g.beginPath();
  g.moveTo(first.x, first.y);
  // Draw through the segment midpoints, to smooth freehand strokes.
  let before = first;
  for (const point of rest) {
    g.quadraticCurveTo(before.x, before.y, (before.x + point.x) / 2, (before.y + point.y) / 2);
    before = point;
  }
  g.lineTo(before.x, before.y);
  if (rest.length === 0) g.lineTo(first.x + 0.01, first.y);
  g.stroke();
}

function box(g: CanvasRenderingContext2D, from: Point, to: Point): void {
  g.beginPath();
  g.roundRect(
    Math.min(from.x, to.x),
    Math.min(from.y, to.y),
    Math.abs(to.x - from.x),
    Math.abs(to.y - from.y),
    g.lineWidth * 1.5,
  );
  g.stroke();
}

function arrow(g: CanvasRenderingContext2D, from: Point, to: Point): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = g.lineWidth * 5;
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(to.x, to.y);
  for (const side of [-1, 1]) {
    g.moveTo(to.x, to.y);
    g.lineTo(
      to.x - head * Math.cos(angle + side * 0.45),
      to.y - head * Math.sin(angle + side * 0.45),
    );
  }
  g.stroke();
}

/** The picture, then the shapes over it, scaled to the current canvas. */
export function paint(
  el: HTMLCanvasElement,
  base: CanvasImageSource | null,
  shapes: readonly Shape[],
): void {
  const g = el.getContext('2d');
  if (g === null || base === null) return;
  g.clearRect(0, 0, el.width, el.height);
  g.drawImage(base, 0, 0, el.width, el.height);
  g.lineWidth = Math.max(4, el.width / 170);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  for (const shape of shapes) {
    const first = shape.points[0];
    const last = shape.points[shape.points.length - 1];
    if (first === undefined || last === undefined) continue;
    if (shape.tool === 'pen') pen(g, shape.points);
    else if (shape.tool === 'box') box(g, first, last);
    else arrow(g, first, last);
  }
}
