/**
 * The view cube as a bevelled solid: six sides, twelve 45° edge strips and eight corner faces, each
 * clickable. Built as a convex solid from one plane per face, so edge and corner cuts can be sized
 * independently (deep corner cuts give hexagonal corners and octagonal sides).
 *
 * Computed in the cube's CSS space (x right, y down, z toward the viewer) from the sides' CSS
 * rotations in `ViewCube.tsx`, whose face mapping was measured, so everything is derived from it.
 * Each face is returned as CSS needs it: box size, `matrix3d` onto the face plane and a
 * `clip-path`.
 */

import type { CubeSide } from '@bezier/renderer';

export type Vec = readonly [number, number, number];

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec): Vec => scale(a, 1 / (Math.hypot(...a) || 1));
const round = (a: Vec): Vec => [Math.round(a[0]), Math.round(a[1]), Math.round(a[2])];

/** Parses "rotateX(-90deg) rotateZ(180deg)" into the rotation it applies to a vector. */
function rotation(transform: string): (v: Vec) => Vec {
  const steps = [...transform.matchAll(/rotate([XYZ])\((-?\d+(?:\.\d+)?)deg\)/g)].map((match) => ({
    axis: match[1] as 'X' | 'Y' | 'Z',
    angle: (Number(match[2]) * Math.PI) / 180,
  }));
  // CSS composes the functions left to right, so the last one acts on the vector first.
  return (v) =>
    steps.reduceRight<Vec>((p, { axis, angle }) => {
      const c = Math.round(Math.cos(angle));
      const s = Math.round(Math.sin(angle));
      const [x, y, z] = p;
      if (axis === 'X') return [x, y * c - z * s, y * s + z * c];
      if (axis === 'Y') return [x * c + z * s, y, -x * s + z * c];
      return [x * c - y * s, x * s + y * c, z];
    }, v);
}

export interface CubeFace {
  kind: 'side' | 'edge' | 'corner';
  /** The sides this face looks from (one, two or three), its own side first. */
  sides: readonly CubeSide[];
  /** Outward normal, in cube space. */
  normal: Vec;
  /** Box size in pixels. */
  width: number;
  height: number;
  /** CSS `matrix3d(...)` placing the box, centred on the cube, onto the face. */
  transform: string;
  /** The face's outline within its box. */
  clipPath: string;
  /**
   * The face as ordered cube-space points, with its centre and the box's across and down
   * directions, for canvas drawing (`view-cube-canvas.ts`).
   */
  outline: readonly Vec[];
  centre: Vec;
  across: Vec;
  down: Vec;
  /**
   * Lighting from 0 to 1, from a world-fixed light above, slightly front and left, so the top is
   * brightest however the cube turns.
   */
  light: number;
}

/**
 * Places a flat polygon as a CSS box. `across` is the box's x direction (a side's reading
 * direction). The box is the polygon's bounding rectangle in its plane; the matrix maps the box
 * centre to that rectangle's centre, front facing outward.
 */
function place(
  corners: readonly Vec[],
  normal: Vec,
  across: Vec,
): Pick<CubeFace, 'width' | 'height' | 'transform' | 'clipPath' | 'centre' | 'across' | 'down'> {
  // The outline is sorted by angle around its centre, so any convex polygon makes a valid
  // clip-path.
  const m = unit(normal);
  const e = unit(sub(across, scale(m, dot(across, m))));
  // e × d = m, so the box's +z faces along the normal.
  const d = cross(m, e);
  const origin = scale(
    corners.reduce((sum, p) => add(sum, p), [0, 0, 0] as Vec),
    1 / corners.length,
  );
  const local = corners.map((p) => [dot(sub(p, origin), e), dot(sub(p, origin), d)] as const);
  const xs = local.map(([x]) => x);
  const ys = local.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const width = x1 - x0;
  const height = y1 - y0;
  const centre = add(origin, add(scale(e, (x0 + x1) / 2), scale(d, (y0 + y1) / 2)));
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  const transform = `matrix3d(${[...e, 0, ...d, 0, ...m, 0, ...centre, 1].map(n).join(',')})`;
  const ordered = [...local].sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  const clipPath = `polygon(${ordered
    .map(([x, y]) => `${n(((x - x0) / width) * 100)}% ${n(((y - y0) / height) * 100)}%`)
    .join(', ')})`;
  return { width, height, transform, clipPath, centre, across: e, down: d };
}

interface Plane {
  normal: Vec;
  offset: number;
}

/**
 * The polygon a plane cuts from a convex solid: a large square in the plane clipped by every other
 * plane. Empty when the plane does not reach the surface.
 */
function faceOf(plane: Plane, all: readonly Plane[], size: number): Vec[] {
  const n = plane.normal;
  const helper: Vec = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, helper));
  const v = cross(n, u);
  const centre = scale(n, plane.offset);
  let polygon: Vec[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => add(centre, add(scale(u, size * (a ?? 0)), scale(v, size * (b ?? 0)))));
  for (const other of all) {
    if (other === plane) continue;
    const inside = (p: Vec) => dot(other.normal, p) - other.offset <= 1e-9;
    const next: Vec[] = [];
    polygon.forEach((p, i) => {
      const q = polygon[(i + 1) % polygon.length] ?? p;
      const pIn = inside(p);
      const qIn = inside(q);
      if (pIn) next.push(p);
      if (pIn !== qIn) {
        const dp = dot(other.normal, p) - other.offset;
        const dq = dot(other.normal, q) - other.offset;
        next.push(add(p, scale(sub(q, p), dp / (dp - dq))));
      }
    });
    polygon = next;
    if (polygon.length === 0) break;
  }
  // Merge points closer than 0.01 px, left where cuts meet.
  return polygon.filter((p, i) => {
    const q = polygon[(i + 1) % polygon.length] ?? p;
    return polygon.length < 2 || Math.hypot(...sub(p, q)) > 0.01;
  });
}

/**
 * Every face of a cube of half-size `half`, from the six sides and their CSS rotations. `edge` is
 * how far each side is cut back by an edge strip, `corner` how far along each edge by a corner
 * face. A corner cut deeper than twice the edge cut gives a hexagonal corner.
 */
export function bevelledCube(
  sides: readonly { view: CubeSide; rotate: string }[],
  half: number,
  edge: number,
  corner: number,
): readonly CubeFace[] {
  const frames = sides.map((side) => {
    const turn = rotation(side.rotate);
    return { view: side.view, normal: round(turn([0, 0, 1])) };
  });
  const sideAt = (direction: Vec) =>
    frames.find((frame) => dot(frame.normal, direction) > 0.5)?.view;
  const up = frames.find((frame) => frame.view === 'top')?.normal ?? [0, 0, 1];
  const front = frames.find((frame) => frame.view === 'front')?.normal ?? [0, 1, 0];
  const left = frames.find((frame) => frame.view === 'left')?.normal ?? [-1, 0, 0];
  const light = unit(add(scale(up, 0.8), add(scale(front, 0.45), scale(left, 0.35))));
  // Same range as the live shading in ViewCube.tsx, so the first frame matches.
  const lit = (normal: Vec) => 0.2 + 0.46 * Math.max(0, dot(unit(normal), light));

  type Planned = Plane & { kind: CubeFace['kind']; sides: CubeSide[]; across?: Vec };
  const planes: Planned[] = [];
  for (const frame of frames) {
    planes.push({ kind: 'side', sides: [frame.view], normal: frame.normal, offset: half });
  }
  for (let i = 0; i < frames.length; i += 1) {
    for (let j = i + 1; j < frames.length; j += 1) {
      const a = frames[i];
      const b = frames[j];
      if (a === undefined || b === undefined || dot(a.normal, b.normal) !== 0) continue;
      // Through the lines where the two sides stop, `edge` short of their shared edge.
      planes.push({
        kind: 'edge',
        sides: [a.view, b.view],
        normal: unit(add(a.normal, b.normal)),
        offset: (2 * half - edge) / Math.SQRT2,
        across: cross(a.normal, b.normal),
      });
    }
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const axes: Vec[] = [
          [sx, 0, 0],
          [0, sy, 0],
          [0, 0, sz],
        ];
        // Through the points `corner` back from the corner along each edge.
        planes.push({
          kind: 'corner',
          sides: axes.map(sideAt).filter((view): view is CubeSide => view !== undefined),
          normal: unit([sx, sy, sz]),
          offset: (3 * half - corner) / Math.sqrt(3),
        });
      }
    }
  }

  const faces: CubeFace[] = [];
  for (const plane of planes) {
    const outline = faceOf(plane, planes, half * 3);
    if (outline.length < 3) continue;
    // Side labels stand upright: on the walls the text foot points down, on top and bottom toward
    // the front.
    const foot: Vec =
      plane.kind !== 'side'
        ? [0, 0, 0]
        : Math.abs(dot(plane.normal, up)) > 0.5
          ? front
          : scale(up, -1);
    const across =
      plane.kind === 'side'
        ? cross(foot, plane.normal)
        : (plane.across ?? sub(outline[1] ?? [1, 0, 0], outline[0] ?? [0, 0, 0]));
    faces.push({
      kind: plane.kind,
      sides: plane.sides,
      normal: plane.normal,
      light: lit(plane.normal),
      outline,
      ...place(outline, plane.normal, across),
    });
  }
  return faces;
}

export interface CubeAxis {
  /** Axis index: 0 X, 1 Y, 2 Z, in cube space. */
  axis: 0 | 1 | 2;
  /** The arm as two crossed strips, so it keeps a width from any angle. */
  strips: readonly { width: number; height: number; transform: string }[];
  /** Position of the axis letter, just past the arm's end. */
  labelAt: Vec;
}

/**
 * The axes as part of the solid: three arms from one corner along the cube's edges, extending past
 * the far side with their letters. Built in cube space so the browser hides an arm exactly when its
 * edge is behind the body. The arms lie on the bevelled-away edges, slightly outside the surface.
 */
export function cubeAxes(
  half: number,
  corner: Vec,
  reach: number,
  gap: number,
  thickness: number,
): readonly CubeAxis[] {
  const origin = scale(corner, half);
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  return ([0, 1, 2] as const).map((axis) => {
    const along: Vec = [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];
    const others: Vec[] = [
      [axis === 1 ? 1 : axis === 2 ? 1 : 0, axis === 0 ? 1 : 0, 0],
      [0, axis === 2 ? 1 : 0, axis === 0 || axis === 1 ? 1 : 0],
    ];
    const centre = add(origin, scale(along, reach / 2));
    const strips = others.map((across) => {
      const normal = cross(along, across);
      return {
        width: reach,
        height: thickness,
        transform: `matrix3d(${[...along, 0, ...across, 0, ...normal, 0, ...centre, 1].map(n).join(',')})`,
      };
    });
    return { axis, strips, labelAt: add(origin, scale(along, reach + gap)) };
  });
}
