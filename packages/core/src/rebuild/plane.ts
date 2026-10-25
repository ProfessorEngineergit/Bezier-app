/**
 * Sketch planes in world space and the 2D↔3D mapping. The single definition shared by the profile
 * builder and the drawing tools. `xDirection`, `yDirection` and `normal` are orthonormal and
 * right-handed, so the two conversions are exact inverses.
 */

import type { Vec3 } from '@bezier/kernel';
import type { SketchPlane } from '../features/types.js';

export interface PlaneBasis {
  origin: Vec3;
  normal: Vec3;
  xDirection: Vec3;
  /** `normal × xDirection`, precomputed. */
  yDirection: Vec3;
}

/**
 * The three origin planes, with 2D axes as seen from the front: on XZ, sketch-y is world +Z.
 */
const PLANES: Record<SketchPlane, PlaneBasis> = {
  XY: {
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
    yDirection: { x: 0, y: 1, z: 0 },
  },
  XZ: {
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: -1, z: 0 },
    xDirection: { x: 1, y: 0, z: 0 },
    yDirection: { x: 0, y: 0, z: 1 },
  },
  YZ: {
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 },
    xDirection: { x: 0, y: 1, z: 0 },
    yDirection: { x: 0, y: 0, z: 1 },
  },
};

/** An origin plane by name, or any other plane (e.g. a flat face) by its basis. */
export type SketchSurface = SketchPlane | PlaneBasis;

/** The basis of a surface, named or not. Null for a name that is not a plane. */
export function surfaceBasis(surface: SketchSurface): PlaneBasis | null {
  return typeof surface === 'string' ? planeBasis(surface) : surface;
}

/** The basis for a named plane, or null when the name is not one of the three. */
export function planeBasis(plane: string): PlaneBasis | null {
  return PLANES[plane as SketchPlane] ?? null;
}

/**
 * The basis for a sketch on a flat face, from the face's plane only: origin is the world origin
 * projected onto it, x is world X projected (world Y if the plane faces along X). Resizing the face
 * does not move the sketch. The viewport uses this too, so both must agree.
 */
export function faceSketchBasis(point: Vec3, normal: Vec3): PlaneBasis {
  const n = unit(normal);
  const offset = point.x * n.x + point.y * n.y + point.z * n.z;
  const origin = { x: n.x * offset, y: n.y * offset, z: n.z * offset };
  const flat = (axis: Vec3): Vec3 => {
    const along = axis.x * n.x + axis.y * n.y + axis.z * n.z;
    return { x: axis.x - n.x * along, y: axis.y - n.y * along, z: axis.z - n.z * along };
  };
  const fromX = flat({ x: 1, y: 0, z: 0 });
  const xDirection = unit(
    Math.hypot(fromX.x, fromX.y, fromX.z) > 0.1 ? fromX : flat({ x: 0, y: 1, z: 0 }),
  );
  const yDirection = {
    x: n.y * xDirection.z - n.z * xDirection.y,
    y: n.z * xDirection.x - n.x * xDirection.z,
    z: n.x * xDirection.y - n.y * xDirection.x,
  };
  return { origin, normal: n, xDirection, yDirection };
}

/**
 * Rotates a plane about its origin: `tilt` about its x, then `turn` about the resulting y. Radians,
 * right-handed. Together they reach any orientation.
 */
export function tiltedBasis(basis: PlaneBasis, tilt: number, turn: number): PlaneBasis {
  if (tilt === 0 && turn === 0) return basis;
  const { origin } = basis;
  // About x: y and the normal turn, x stays.
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const y1 = combine(basis.yDirection, ct, basis.normal, st);
  const n1 = combine(basis.normal, ct, basis.yDirection, -st);
  // About the new y: x and the normal turn, y stays.
  const cu = Math.cos(turn);
  const su = Math.sin(turn);
  const x2 = combine(basis.xDirection, cu, n1, -su);
  const n2 = combine(n1, cu, basis.xDirection, su);
  return { origin, xDirection: unit(x2), yDirection: unit(y1), normal: unit(n2) };
}

/** A sketch's offset from its plane or face: rotated, then moved along the normal. */
export interface PlaneLean {
  offset: number;
  tilt: number;
  turn: number;
}

/** Reads the lean from sketch parameters; missing values are 0. */
export function leanOf(params: Readonly<Record<string, unknown>>): PlaneLean {
  const read = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return { offset: read(params.offset), tilt: read(params.tilt), turn: read(params.turn) };
}

/** Applies a lean to a resting basis. Shared by the rebuild and the sketcher, which must agree. */
export function leanedBasis(rest: PlaneBasis, lean: PlaneLean): PlaneBasis {
  const turned = tiltedBasis(rest, lean.tilt, lean.turn);
  if (lean.offset === 0) return turned;
  const { origin, normal } = turned;
  return {
    ...turned,
    origin: {
      x: origin.x + normal.x * lean.offset,
      y: origin.y + normal.y * lean.offset,
      z: origin.z + normal.z * lean.offset,
    },
  };
}

/**
 * The nearest origin plane and the lean that makes its normal face `direction`, for sketching in an
 * oblique view. Closed form from `tiltedBasis`: in plane axes the leaned normal is
 * (sin turn, −sin tilt · cos turn, cos tilt · cos turn).
 */
export function planeFacing(direction: Vec3): { plane: SketchPlane; lean: PlaneLean } {
  const d = unit(direction);
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  let plane: SketchPlane = 'XY';
  for (const name of ['XZ', 'YZ'] as const)
    if (Math.abs(dot(d, PLANES[name].normal)) > Math.abs(dot(d, PLANES[plane].normal)))
      plane = name;
  const rest = PLANES[plane];
  const sinTurn = Math.max(-1, Math.min(1, dot(d, rest.xDirection)));
  const turn = Math.asin(sinTurn);
  const tilt = Math.atan2(-dot(d, rest.yDirection), dot(d, rest.normal));
  // Snap rounding noise to zero.
  const clean = (angle: number) => (Math.abs(angle) < 1e-9 ? 0 : angle);
  return { plane, lean: { offset: 0, tilt: clean(tilt), turn: clean(turn) } };
}

/** The inverse of `leanedBasis`. */
export function restingBasis(leaned: PlaneBasis, lean: PlaneLean): PlaneBasis {
  const { origin, normal } = leaned;
  const back = {
    ...leaned,
    origin: {
      x: origin.x - normal.x * lean.offset,
      y: origin.y - normal.y * lean.offset,
      z: origin.z - normal.z * lean.offset,
    },
  };
  // Undo in reverse order: turn, then tilt.
  const unturned = tiltedBasis(back, 0, -lean.turn);
  return tiltedBasis(unturned, -lean.tilt, 0);
}

function combine(a: Vec3, ka: number, b: Vec3, kb: number): Vec3 {
  return { x: a.x * ka + b.x * kb, y: a.y * ka + b.y * kb, z: a.z * ka + b.z * kb };
}

function unit(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** The origin plane names. */
export function planeNames(): readonly SketchPlane[] {
  return ['XY', 'XZ', 'YZ'];
}

/** Maps plane coordinates to world space. */
export function planeToWorld(basis: PlaneBasis, u: number, v: number): Vec3 {
  return {
    x: basis.origin.x + basis.xDirection.x * u + basis.yDirection.x * v,
    y: basis.origin.y + basis.xDirection.y * u + basis.yDirection.y * v,
    z: basis.origin.z + basis.xDirection.z * u + basis.yDirection.z * v,
  };
}

/** Maps a world point to plane coordinates, projecting points off the plane onto it. */
export function worldToPlane(basis: PlaneBasis, point: Vec3): { u: number; v: number } {
  const dx = point.x - basis.origin.x;
  const dy = point.y - basis.origin.y;
  const dz = point.z - basis.origin.z;
  return {
    u: dx * basis.xDirection.x + dy * basis.xDirection.y + dz * basis.xDirection.z,
    v: dx * basis.yDirection.x + dy * basis.yDirection.y + dz * basis.yDirection.z,
  };
}
