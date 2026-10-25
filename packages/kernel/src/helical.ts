/**
 * Helical sweep: a revolve with a pitch, as for a thread or a spring (audit F-018). The profile is
 * swept along a helix through its center, oriented to the axis so it keeps facing it.
 */
import type { Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const scaled = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (a: Vec3): Vec3 => scaled(a, 1 / Math.hypot(a.x, a.y, a.z));

/** Sweeps `face` `turns` times round the axis, rising `pitch` per turn. Caller owns the result. */
export function helicalSweep(
  occt: RawKernel,
  face: RawHandle,
  axisOrigin: Vec3,
  axisDirection: Vec3,
  turns: number,
  pitch: number,
): RawHandle {
  const axis = unit(axisDirection);
  const middle = occt.getSurfaceCenterOfMass(face);
  const along = dot(sub(middle, axisOrigin), axis);
  const foot = add(axisOrigin, scaled(axis, along));
  const out = sub(middle, foot);
  const radius = Math.hypot(out.x, out.y, out.z);
  if (radius < 1e-6) throw new Error('The profile sits on the axis; it has nowhere to wind.');
  const height = Math.abs(pitch) * turns;
  const helix = occt.makeHelixWireHanded(foot, axis, Math.abs(pitch), height, radius, pitch < 0);
  const held: RawHandle[] = [helix];
  try {
    // The helix starts where OCCT's frame for the axis puts it; turn it to start at the profile.
    const [edge] = occt.getSubShapes(helix, 'edge');
    if (edge === undefined) throw new Error('The helix could not be made.');
    held.push(edge);
    const start = occt.curvePointAtParam(edge, occt.curveParameters(edge).first);
    const from = unit(sub(start, foot));
    const to = unit(out);
    const angle = Math.atan2(dot(cross(from, to), axis), dot(from, to));
    const spine = occt.rotate(helix, { point: foot, direction: axis }, angle);
    held.push(spine);
    const wire = occt.outerWire(face);
    held.push(wire);
    return occt.sweepOriented(wire, spine, 2, axis);
  } finally {
    for (const shape of held) occt.release(shape);
  }
}
