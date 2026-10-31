/**
 * The view cube independent of rendering: faces and their click targets, shading and axes. Drawn on
 * a canvas (`view-cube-canvas.ts`).
 */

import type { SketchPlane } from '@bezier/core';
import type { CubeSide, ViewPlane } from '@bezier/renderer';
import type { ViewportHandle } from './Viewport.js';
import { bevelledCube, type CubeFace, cubeAxes } from './view-cube-geometry.js';

/**
 * A cube face: its label, the view a click goes to and its shade. `rotate` turns the
 * identity-forward side to this one. The outward push is separate because the same rotation places
 * the core and the shaded panel just above it at different depths.
 */
export interface Face {
  view: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
  label: string;
  rotate: string;
}

/**
 * The six faces, each transform paired with its view. The pairing was measured, not derived: the
 * sync matrix flips Y, and the identity-forward side (`translateZ`) is Top, not Front.
 */
export const FACES: readonly Face[] = [
  { view: 'top', label: 'Top', rotate: '' },
  { view: 'bottom', label: 'Bottom', rotate: 'rotateY(180deg)' },
  { view: 'right', label: 'Right', rotate: 'rotateY(90deg)' },
  { view: 'left', label: 'Left', rotate: 'rotateY(-90deg)' },
  { view: 'front', label: 'Front', rotate: 'rotateX(-90deg)' },
  // Extra half turn in its own plane: `rotateX(90deg)` alone leaves the label upside down.
  { view: 'back', label: 'Back', rotate: 'rotateX(90deg) rotateZ(180deg)' },
];

/**
 * Cut-back of each side by an edge strip and by a corner along each edge, in pixels on a 48 px
 * cube. Corners are cut much deeper so they are large enough to hit; strips stay narrow.
 */
const EDGE_CUT = 5;
const CORNER_CUT = 16;

/**
 * The light in view space (x right, y down, z toward the viewer): above, slightly left and in
 * front. Fixed to the view, so faces toward the viewer are lit and the silhouette falls into shade.
 */
const LIGHT = (() => {
  const v = [-0.35, -0.6, 0.72];
  const length = Math.hypot(...v);
  return v.map((c) => c / length) as [number, number, number];
})();

/**
 * Lighting for a cube-space normal: from a fifth to two thirds of the way to the lit tone. Higher
 * made the cube the brightest thing in the dark chrome.
 */
export function shadeOf(m: readonly number[], normal: readonly number[]): number {
  const [nx = 0, ny = 0, nz = 0] = normal;
  const x = (m[0] ?? 0) * nx + (m[4] ?? 0) * ny + (m[8] ?? 0) * nz;
  const y = (m[1] ?? 0) * nx + (m[5] ?? 0) * ny + (m[9] ?? 0) * nz;
  const z = (m[2] ?? 0) * nx + (m[6] ?? 0) * ny + (m[10] ?? 0) * nz;
  return 0.2 + 0.46 * Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
}

/** No lean: square onto a side. */
const SQUARE = { offset: 0, tilt: 0, turn: 0 };

function planeForView(view: Face['view']): SketchPlane {
  if (view === 'top' || view === 'bottom') return 'XY';
  if (view === 'front' || view === 'back') return 'XZ';
  return 'YZ';
}

/** Orbit radians per pixel dragged. */
export const ORBIT_PER_PIXEL = 0.01;
/** Pixels before a press becomes a drag, so a small wobble still counts as a click. */
export const DRAG_THRESHOLD = 4;
/**
 * Half the cube's edge in pixels. Mirrors `--cube-half`, which places the faces in CSS; a test
 * keeps them in sync.
 */
export const CUBE_HALF = 24;

/** Every face of the bevelled cube, computed once. */
export const CUBE = bevelledCube(FACES, CUBE_HALF, EDGE_CUT, CORNER_CUT);

/**
 * The corner the axis arms grow from. Measured against the camera, not derived: CSS counts Y
 * downward, so the signs differ from what the world axes suggest.
 */
export const AXIS_CORNER = [-1, -1, -1] as const;
export const AXIS_PARTS = cubeAxes(CUBE_HALF, AXIS_CORNER, CUBE_HALF * 2 + 13, 11, 2);

/** The label of a side, or undefined for an edge or corner. */
export function labelOf(face: CubeFace): string | undefined {
  return face.kind === 'side'
    ? FACES.find((side) => side.view === face.sides[0])?.label
    : undefined;
}

/**
 * What a click on a face does: a side squares the view onto it, an edge or corner looks from
 * between its sides. Shared by both renderers.
 */
export function pickFace(
  face: CubeFace,
  handle: ViewportHandle | null,
  animate: boolean,
  onSketchPlane: ((plane: ViewPlane) => void) | undefined,
  onPicked: ((sides: readonly CubeSide[]) => void) | undefined,
): void {
  if (face.kind === 'side') {
    const view = face.sides[0];
    if (view === undefined) return;
    handle?.setView(view, animate);
    onSketchPlane?.({ plane: planeForView(view), lean: SQUARE });
    onPicked?.([view]);
    return;
  }
  handle?.setViewBetween(face.sides, animate);
  const facing = handle?.sketchPlaneForView() ?? null;
  if (facing !== null) onSketchPlane?.(facing);
  onPicked?.(face.sides);
}
