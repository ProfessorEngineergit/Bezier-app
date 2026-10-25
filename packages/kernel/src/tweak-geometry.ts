/**
 * The motions a face of a tweak takes, worked out from what was picked: plain vector algebra on
 * row-major 3×4 matrices, the form the kernel reads (`tweak-parts.ts`).
 */
import { Refused } from './occt-support.js';
import type { Vec3 } from './types.js';

/** Row-major 3×4: rotation, then translation. What the kernel reads per face. */
export type Matrix = readonly number[];

export const NONE = 1e-9;
export const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const unit = (a: Vec3): Vec3 => mul(a, 1 / length(a));

export function slide(by: Vec3): Matrix {
  return [1, 0, 0, by.x, 0, 1, 0, by.y, 0, 0, 1, by.z];
}

/** Rodrigues' turn about the line through `origin` along `axis`. */
export function turnAbout(origin: Vec3, axis: Vec3, angle: number): Matrix {
  const { x, y, z } = unit(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const r = [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ] as const;
  const o = [origin.x, origin.y, origin.z] as const;
  const moved = (row: readonly [number, number, number]) =>
    row[0] * o[0] + row[1] * o[1] + row[2] * o[2];
  return [...r[0], o[0] - moved(r[0]), ...r[1], o[1] - moved(r[1]), ...r[2], o[2] - moved(r[2])];
}

/** `a` after `b`. */
export function compose(a: Matrix, b: Matrix): Matrix {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      let v = j === 3 ? (a[i * 4 + 3] ?? 0) : 0;
      for (let k = 0; k < 3; k++) v += (a[i * 4 + k] ?? 0) * (b[k * 4 + j] ?? 0);
      out.push(v);
    }
  }
  return out;
}

/**
 * The line the points lie on, or null when they span a plane. A single point is a line of no
 * direction.
 */
export function lineThrough(points: readonly Vec3[]): { at: Vec3; along: Vec3 | null } | null {
  const at = points[0] as Vec3;
  let along: Vec3 | null = null;
  let size = 0;
  for (const p of points) size = Math.max(size, length(sub(p, at)));
  const tolerance = Math.max(size, 1) * 1e-7;
  for (const p of points) {
    const d = sub(p, at);
    if (length(d) <= tolerance) continue;
    if (along === null) {
      along = unit(d);
      continue;
    }
    if (length(cross(along, d)) > tolerance) return null;
  }
  return { at, along };
}

/**
 * A flat face slid at some of its points: it tilts about its far side so that it passes through
 * the slid points. `null` when the slide leaves its plane where it was.
 */
export function tiltOf(
  outline: readonly Vec3[],
  normal: Vec3,
  picked: readonly Vec3[],
  by: Vec3,
): Matrix | null {
  const line = lineThrough(picked);
  // Points across the face: all of it goes.
  if (line === null) return Math.abs(dot(by, normal)) > NONE ? slide(by) : null;
  // In the face's plane, away from the picked line, towards the far side.
  let across: Vec3;
  if (line.along !== null) {
    across = unit(cross(normal, line.along));
  } else {
    // A corner: across is towards it from the point of the face farthest from it.
    let far = line.at;
    for (const p of outline) if (length(sub(p, line.at)) > length(sub(far, line.at))) far = p;
    const d = sub(line.at, far);
    const inPlane = sub(d, mul(normal, dot(d, normal)));
    if (length(inPlane) <= NONE) return null;
    across = unit(inPlane);
  }
  let reach = 0;
  for (const p of outline) {
    const s = dot(sub(p, line.at), across);
    if (Math.abs(s) > Math.abs(reach)) reach = s;
  }
  // The far side is behind the picked line.
  if (reach > 0) {
    across = mul(across, -1);
    reach = -reach;
  }
  const distance = -reach;
  if (distance <= NONE) return null;
  const ahead = distance + dot(by, across);
  if (ahead <= NONE) throw new Refused('This would fold a face beside it over itself.');
  const angle = Math.atan2(dot(by, normal), ahead);
  if (Math.abs(angle) <= NONE) return null;
  return turnAbout(add(line.at, mul(across, reach)), cross(across, normal), angle);
}

function apply(m: Matrix, p: Vec3): Vec3 {
  const at = (i: number) => m[i] ?? 0;
  return {
    x: at(0) * p.x + at(1) * p.y + at(2) * p.z + at(3),
    y: at(4) * p.x + at(5) * p.y + at(6) * p.z + at(7),
    z: at(8) * p.x + at(9) * p.y + at(10) * p.z + at(11),
  };
}

/**
 * A planar face at a turned straight edge. It turns as a whole only when that keeps it in its own
 * plane; otherwise it is ruled between its fixed far side and the turned edge (twenty-four numbers,
 * the kernel's form for that). Without a straight far side (triangle, curved outline) it turns
 * whole.
 */
export function twistOf(
  outline: readonly Vec3[],
  normal: Vec3,
  picked: readonly Vec3[],
  whole: Matrix,
): Matrix {
  const line = lineThrough(picked);
  if (line === null || line.along === null) return whole;
  const along = line.along;
  const turnedNormal = sub(apply(whole, normal), apply(whole, { x: 0, y: 0, z: 0 }));
  const stays =
    length(cross(turnedNormal, normal)) < 1e-9 &&
    Math.abs(dot(sub(apply(whole, line.at), line.at), normal)) < 1e-9;
  if (stays) return whole;
  const across = unit(cross(normal, along));
  let reach = 0;
  for (const p of outline) {
    const s = dot(sub(p, line.at), across);
    if (Math.abs(s) > Math.abs(reach)) reach = s;
  }
  const size = Math.max(Math.abs(reach), 1);
  const far = outline.filter((p) => Math.abs(dot(sub(p, line.at), across) - reach) < size * 1e-6);
  const ends = (points: readonly Vec3[]) => {
    let low = points[0] as Vec3;
    let high = low;
    for (const p of points) {
      if (dot(p, along) < dot(low, along)) low = p;
      if (dot(p, along) > dot(high, along)) high = p;
    }
    return [low, high] as const;
  };
  const [f0, f1] = ends(far);
  if (Math.abs(reach) <= NONE || length(sub(f1, f0)) < size * 1e-6) return whole;
  const [p0, p1] = ends(picked);
  const [q0, q1] = [apply(whole, p0), apply(whole, p1)];
  return [...IDENTITY, f0.x, f0.y, f0.z, f1.x, f1.y, f1.z, q0.x, q0.y, q0.z, q1.x, q1.y, q1.z];
}
