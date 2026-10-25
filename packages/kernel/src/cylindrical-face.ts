/** Exact cylinder classification and a bounded annular edit, independent of tessellation. */
import { refineHistory } from './refine-history.js';
import { offsetFaces } from './tweak-parts.js';
import type { CylindricalFace, Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type Handle = ReturnType<RawKernel['makeBox']>;
type Evolution = ReturnType<RawKernel['cutWithHistory']>;

/** Partial or irregularly trimmed cylinders are not safe targets for an axial sleeve. */
export function describeCylinder(kernel: RawKernel, face: Handle): CylindricalFace | null {
  const data = kernel.getFaceCylinderData(face);
  if (!data) return null;
  const uv = kernel.uvBounds(face);
  const height = uv.vMax - uv.vMin;
  if (!(height > 1e-7) || Math.abs(uv.uMax - uv.uMin - Math.PI * 2) > 1e-6) return null;
  const expectedArea = Math.PI * 2 * data.radius * height;
  if (Math.abs(kernel.getSurfaceArea(face) - expectedArea) > expectedArea * 1e-6) return null;
  const u = (uv.uMin + uv.uMax) / 2;
  const bottom = centreAt(kernel, face, u, uv.vMin);
  const top = centreAt(kernel, face, u, uv.vMax);
  const axis = unit(subtract(top, bottom));
  const point = kernel.pointOnSurface(face, u, (uv.vMin + uv.vMax) / 2);
  const middle = centreAt(kernel, face, u, (uv.vMin + uv.vMax) / 2);
  const radial = unit(subtract(point, middle));
  const normal = kernel.surfaceNormal(face, u, (uv.vMin + uv.vMax) / 2);
  return {
    radius: data.radius,
    origin: bottom,
    axis,
    radial,
    height,
    inward: dot(normal, radial) < 0,
  };
}

/** The wall's provenance follows its replacement instead of disappearing after the boolean. */
export function resizeCylinder(
  kernel: RawKernel,
  body: Handle,
  face: Handle,
  radius: number,
  hashes: number[],
  bound: number,
): Evolution {
  const cylinder = describeCylinder(kernel, face);
  if (!cylinder || !Number.isFinite(radius) || radius <= 0)
    throw new Error('Select a complete cylindrical wall and a positive radius.');
  if (Math.abs(radius - cylinder.radius) < 1e-7)
    return kernel.translateWithHistory(body, 0, 0, 0, hashes, bound);
  // Move the wall itself and let its neighbours follow: exact, and every face keeps its name. The
  // tweak cannot add or remove faces, so a radius that runs into another face falls through to the
  // sleeve below, whose boolean can.
  try {
    const outward = cylinder.inward ? cylinder.radius - radius : radius - cylinder.radius;
    return offsetFaces(kernel, body, [face], outward, hashes, bound);
  } catch {
    // Falls through to the sleeve.
  }
  const held: Handle[] = [];
  const keep = (shape: Handle) => {
    held.push(shape);
    return shape;
  };
  let result: Handle | null = null;
  try {
    const circle = (r: number) =>
      keep(kernel.makeWire([keep(kernel.makeCircleEdge(cylinder.origin, cylinder.axis, r))]));
    const outer = keep(kernel.makeFace(circle(Math.max(radius, cylinder.radius))));
    const annulus = keep(kernel.addHolesInFace(outer, [circle(Math.min(radius, cylinder.radius))]));
    const n = cylinder.axis;
    const sleeve = keep(
      kernel.extrude(annulus, n.x * cylinder.height, n.y * cylinder.height, n.z * cylinder.height),
    );
    const cutting = cylinder.inward === radius > cylinder.radius;
    let evolution = cutting
      ? kernel.cutWithHistory(body, sleeve, hashes, bound)
      : kernel.fuseWithHistory(body, sleeve, hashes, bound);
    result = evolution.result;
    const refined = refineHistory(kernel, evolution, hashes, bound);
    kernel.release(result);
    evolution = refined;
    result = evolution.result;
    if (!kernel.isValid(result)) throw new Error('This radius does not produce a valid solid.');
    const replacements: number[] = [];
    for (const candidate of kernel.getSubShapes(result, 'face')) {
      try {
        const wall = describeCylinder(kernel, candidate);
        if (
          wall &&
          Math.abs(wall.radius - radius) < 1e-6 &&
          wall.inward === cylinder.inward &&
          Math.abs(Math.abs(dot(wall.axis, cylinder.axis)) - 1) < 1e-6 &&
          axialDistance(wall.origin, cylinder) < 1e-6
        )
          replacements.push(kernel.hashCode(candidate, bound));
      } finally {
        kernel.release(candidate);
      }
    }
    if (replacements.length !== 1)
      throw new Error('The resized wall would merge with another boundary.');
    const old = kernel.hashCode(face, bound);
    const modified: number[] = [];
    for (let i = 0; i + 1 < evolution.modified.length; ) {
      const count = evolution.modified[i + 1] ?? 0;
      if (evolution.modified[i] !== old)
        modified.push(...evolution.modified.slice(i, i + 2 + count));
      i += 2 + count;
    }
    modified.push(old, 1, replacements[0] ?? 0);
    result = null;
    return { ...evolution, modified, deleted: evolution.deleted.filter((h) => h !== old) };
  } finally {
    if (result !== null) kernel.release(result);
    for (let i = held.length - 1; i >= 0; i--) {
      const shape = held[i];
      if (shape !== undefined) kernel.release(shape);
    }
  }
}

function centreAt(kernel: RawKernel, face: Handle, u: number, v: number): Vec3 {
  const a = kernel.pointOnSurface(face, u, v),
    b = kernel.pointOnSurface(face, u + Math.PI, v);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function unit(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
function axialDistance(point: Vec3, cylinder: CylindricalFace): number {
  const delta = subtract(point, cylinder.origin),
    along = dot(delta, cylinder.axis);
  return Math.hypot(
    delta.x - along * cylinder.axis.x,
    delta.y - along * cylinder.axis.y,
    delta.z - along * cylinder.axis.z,
  );
}
