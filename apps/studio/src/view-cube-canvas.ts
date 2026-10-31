/**
 * The view cube drawn on a single canvas. It was dozens of 3D layers in the DOM, which a window
 * without a GPU recomposited every frame (4 fps instead of 50 in a Linux VM) and which the browser
 * cut into pieces where the axis arms crossed them; one canvas is one flat layer and one solid.
 *
 * Uses the solid, light and axes of `view-cube-model.ts`, projected the way CSS 3D would: the cube
 * matrix, pushed back by half its size, seen through the cube perspective.
 * The solid is convex, so front faces never overlap and need no sorting.
 */

import type { CubeFace, Vec } from './view-cube-geometry.js';
import { AXIS_CORNER, AXIS_PARTS, CUBE, CUBE_HALF, labelOf, shadeOf } from './view-cube-model.js';

/** Margin around the 48 px cube for perspective corners, arms and letters. */
export const CANVAS_MARGIN = 30;
export const CANVAS_SIZE = CUBE_HALF * 2 + CANVAS_MARGIN * 2;

type Rgb = readonly [number, number, number];

export interface CubePalette {
  light: Rgb;
  dark: Rgb;
  hover: string;
  axes: readonly [string, string, string];
  font: string;
}

/** A face's outline on the canvas, in CSS pixels; null for a face turned away. */
export type Drawn = readonly (readonly (readonly [number, number])[] | null)[];

/** Projects a cube-space point as CSS would: canvas x, y and z toward the viewer. */
function project(m: readonly number[], p: Vec, perspective: number): [number, number, number] {
  const x = (m[0] ?? 0) * p[0] + (m[4] ?? 0) * p[1] + (m[8] ?? 0) * p[2] + (m[12] ?? 0);
  const y = (m[1] ?? 0) * p[0] + (m[5] ?? 0) * p[1] + (m[9] ?? 0) * p[2] + (m[13] ?? 0);
  const z =
    (m[2] ?? 0) * p[0] + (m[6] ?? 0) * p[1] + (m[10] ?? 0) * p[2] + (m[14] ?? 0) - CUBE_HALF;
  const k = perspective / (perspective - z);
  const centre = CANVAS_SIZE / 2;
  return [centre + x * k, centre + y * k, z];
}

/** Whether a plane through `at` with outward `normal` faces the viewer at the perspective point. */
function facing(m: readonly number[], at: Vec, normal: Vec, perspective: number): boolean {
  const nz = (m[2] ?? 0) * normal[0] + (m[6] ?? 0) * normal[1] + (m[10] ?? 0) * normal[2];
  const nx = (m[0] ?? 0) * normal[0] + (m[4] ?? 0) * normal[1] + (m[8] ?? 0) * normal[2];
  const ny = (m[1] ?? 0) * normal[0] + (m[5] ?? 0) * normal[1] + (m[9] ?? 0) * normal[2];
  const px = (m[0] ?? 0) * at[0] + (m[4] ?? 0) * at[1] + (m[8] ?? 0) * at[2] + (m[12] ?? 0);
  const py = (m[1] ?? 0) * at[0] + (m[5] ?? 0) * at[1] + (m[9] ?? 0) * at[2] + (m[13] ?? 0);
  const pz =
    (m[2] ?? 0) * at[0] + (m[6] ?? 0) * at[1] + (m[10] ?? 0) * at[2] + (m[14] ?? 0) - CUBE_HALF;
  return nx * -px + ny * -py + nz * (perspective - pz) > 0;
}

const mix = (palette: CubePalette, shade: number): string => {
  const c = palette.light.map((l, i) =>
    Math.round(l * shade + (palette.dark[i] ?? 0) * (1 - shade)),
  );
  return `rgb(${c.join(',')})`;
};

/** Draws the axis arms: along the cube, beyond it, and their letters. */
function paintAxes(
  ctx: CanvasRenderingContext2D,
  m: readonly number[],
  perspective: number,
  palette: CubePalette,
  dpr: number,
  front: boolean,
): void {
  const origin: Vec = [
    AXIS_CORNER[0] * CUBE_HALF,
    AXIS_CORNER[1] * CUBE_HALF,
    AXIS_CORNER[2] * CUBE_HALF,
  ];
  const middle = -CUBE_HALF;
  for (const part of AXIS_PARTS) {
    const along: Vec = [part.axis === 0 ? 1 : 0, part.axis === 1 ? 1 : 0, part.axis === 2 ? 1 : 0];
    const at = (t: number): Vec => [
      origin[0] + along[0] * t,
      origin[1] + along[1] * t,
      origin[2] + along[2] * t,
    ];
    // The arm lies on the edge between the corner's two other sides, so it is visible when either
    // of them is.
    const seen = [0, 1, 2]
      .filter((i) => i !== part.axis)
      .some((i) => {
        const normal: Vec = [
          i === 0 ? AXIS_CORNER[0] : 0,
          i === 1 ? AXIS_CORNER[1] : 0,
          i === 2 ? AXIS_CORNER[2] : 0,
        ];
        return facing(m, at(CUBE_HALF), normal, perspective);
      });
    const colour = palette.axes[part.axis];
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const segment = (from: number, to: number) => {
      const a = project(m, at(from), perspective);
      const b = project(m, at(to), perspective);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    };
    if (front && seen) segment(0, CUBE_HALF * 2);
    const tip = project(m, at(CUBE_HALF * 2 + 13), perspective);
    // Beyond the cube, an arm and its letter are in front of or behind the body.
    if (tip[2] > middle === front) {
      segment(CUBE_HALF * 2, CUBE_HALF * 2 + 13);
      const label = project(m, part.labelAt, perspective);
      ctx.save();
      ctx.font = `700 10px ${palette.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgb(0 0 0 / 70%)';
      ctx.shadowBlur = 2 * dpr;
      ctx.fillText(['X', 'Y', 'Z'][part.axis] ?? '', label[0], label[1]);
      ctx.restore();
    }
  }
}

/** Draws the cube for the camera matrix; returns each face's outline for hit testing. */
export function paintCube(
  ctx: CanvasRenderingContext2D,
  m: readonly number[],
  perspective: number,
  palette: CubePalette,
  hovered: number,
  dpr: number,
): Drawn {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  paintAxes(ctx, m, perspective, palette, dpr, false);
  const drawn = CUBE.map((face: CubeFace, index) => {
    if (!facing(m, face.centre, face.normal, perspective)) return null;
    const points = face.outline.map((p) => {
      const [x, y] = project(m, p, perspective);
      return [x, y] as const;
    });
    const fill = index === hovered ? palette.hover : mix(palette, shadeOf(m, face.normal));
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    // Stroke in the fill colour so neighbouring faces meet without a seam.
    ctx.strokeStyle = fill;
    ctx.lineWidth = 0.75;
    ctx.stroke();
    return points;
  });
  CUBE.forEach((face, index) => {
    const label = labelOf(face);
    if (label === undefined || drawn[index] === null) return;
    // The label lies in the face: its across and down directions projected onto the canvas.
    const [cx, cy] = project(m, face.centre, perspective);
    const shift = (d: Vec): Vec => [
      face.centre[0] + d[0],
      face.centre[1] + d[1],
      face.centre[2] + d[2],
    ];
    const [ax, ay] = project(m, shift(face.across), perspective);
    const [bx, by] = project(m, shift(face.down), perspective);
    ctx.save();
    ctx.setTransform(
      dpr * (ax - cx),
      dpr * (ay - cy),
      dpr * (bx - cx),
      dpr * (by - cy),
      dpr * cx,
      dpr * cy,
    );
    ctx.font = `600 10px ${palette.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2f2f4';
    ctx.shadowColor = 'rgb(0 0 0 / 45%)';
    ctx.shadowOffsetY = dpr;
    ctx.shadowBlur = dpr;
    ctx.fillText(label, 0, 0.5);
    ctx.restore();
  });
  paintAxes(ctx, m, perspective, palette, dpr, true);
  return drawn;
}

/** The face under a point of the canvas, by index in `CUBE`, or -1. */
export function faceAt(drawn: Drawn, x: number, y: number): number {
  return drawn.findIndex((points) => {
    if (points === null || points.length < 3) return false;
    let sign = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a === undefined || b === undefined) return false;
      const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (cross === 0) continue;
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  });
}

/**
 * The cube's colours from the current theme. Read through an element because the tokens reference
 * other tokens, which only the browser resolves.
 */
export function readPalette(root: HTMLElement): CubePalette {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  root.append(probe);
  const read = (token: string) => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };
  const rgb = (colour: string): Rgb => {
    const [r = 0, g = 0, b = 0] = (colour.match(/[\d.]+/g) ?? []).map(Number);
    return [r, g, b];
  };
  const palette: CubePalette = {
    light: rgb(read('--cube-light')),
    dark: rgb(read('--cube-dark')),
    hover: read('--cube-hover'),
    axes: [read('--gnomon-x'), read('--gnomon-y'), read('--gnomon-z')],
    font: getComputedStyle(root).fontFamily,
  };
  probe.remove();
  return palette;
}
