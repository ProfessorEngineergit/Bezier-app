/**
 * Wraps a sketch on a plane beside a cylindrical face round that face, raised or cut (audit
 * F-051). Plain projection would stretch the shape towards the sides, so each point is first moved
 * so its distance round the face equals its distance across the plane (x becomes R·sin(x/R)).
 * The result is a tool solid to join or cut; only the half of the face towards the sketch is
 * reached.
 */
import type { Profile } from './kernel.js';
import { Refused } from './occt-support.js';
import { wireOfLoop } from './profile-face.js';
import type { Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 => mul(a, 1 / length(a));

/** Points along a curved edge of the sketch. */
const SAMPLES = 32;

/** The loop's edges as points, in order, curved ones sampled. */
function pointsOf(occt: RawKernel, wire: RawHandle): Vec3[] {
  const edges = occt.getSubShapes(wire, 'edge');
  try {
    const out: Vec3[] = [];
    for (const edge of edges) {
      const { first, last } = occt.curveParameters(edge);
      const count = occt.curveType(edge) === 'line' ? 1 : SAMPLES;
      const run = Array.from({ length: count + 1 }, (_, i) =>
        occt.curvePointAtParam(edge, first + ((last - first) * i) / count),
      );
      const end = out[out.length - 1];
      const head = run[0] as Vec3;
      const tail = run[run.length - 1] as Vec3;
      // Edges of a wire run end to end, but not every one in the wire's direction.
      const forward = end === undefined || length(sub(head, end)) <= length(sub(tail, end));
      out.push(...(forward ? run : run.reverse()).slice(end === undefined ? 0 : 1));
    }
    if (out.length > 1 && length(sub(out[0] as Vec3, out[out.length - 1] as Vec3)) < 1e-6)
      out.pop();
    return out;
  } finally {
    for (const edge of edges) occt.release(edge);
  }
}

/** A closed polygon as a wire. */
function polygon(occt: RawKernel, points: readonly Vec3[], held: RawHandle[]): RawHandle {
  const edges = points.map((p, i) => occt.makeLineEdge(p, points[(i + 1) % points.length] as Vec3));
  held.push(...edges);
  const wire = occt.makeWire(edges);
  held.push(wire);
  return wire;
}

/** A solid cylinder of `radius` round the axis through `from` along `axis`, `span` long. */
function rod(occt: RawKernel, from: Vec3, axis: Vec3, radius: number, span: number): RawHandle {
  const z = axis;
  const helper = Math.abs(z.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const x = unit(sub(helper, mul(z, dot(helper, z))));
  const y = cross(z, x);
  const upright = occt.makeCylinder(radius, span);
  try {
    return occt.transform(upright, [
      x.x,
      y.x,
      z.x,
      from.x,
      x.y,
      y.y,
      z.y,
      from.y,
      x.z,
      y.z,
      z.z,
      from.z,
    ]);
  } finally {
    occt.release(upright);
  }
}

/**
 * The tool for `profile` wrapped onto the cylindrical `face`: raised by `depth` when positive (to be
 * joined), cut `-depth` deep when negative (to be cut). The caller owns the result.
 */
export function wrapTool(
  occt: RawKernel,
  face: RawHandle,
  profile: Profile,
  depth: number,
): RawHandle {
  const data = occt.getFaceCylinderData(face);
  if (data === null) throw new Refused('Wrap goes onto a round face: pick a cylindrical one.');
  if (!(Math.abs(depth) > 1e-6)) throw new Refused('Wrap needs a height or a depth.');
  const radius = data.radius;
  const uv = occt.uvBounds(face);
  const u = (uv.uMin + uv.uMax) / 2;
  const centre = (v: number) => {
    const a = occt.pointOnSurface(face, u, v);
    const b = occt.pointOnSurface(face, u + Math.PI, v);
    return mul(add(a, b), 0.5);
  };
  const base = centre(uv.vMin);
  const axis = unit(sub(centre(uv.vMax), base));
  // Across the plane, square to the axis; and from the plane towards the axis.
  const across = cross(axis, profile.normal);
  if (length(across) < 1e-6)
    throw new Refused('Draw what is wrapped on a plane beside the round face, not across its end.');
  const side = unit(across);
  const offAxis = sub(profile.origin, base);
  const toAxis = mul(sub(offAxis, mul(axis, dot(offAxis, axis))), -1);
  const reach = length(toAxis);
  if (reach <= radius) throw new Refused('Draw what is wrapped on a plane outside the round face.');
  const inward = unit(toAxis);

  const held: RawHandle[] = [];
  try {
    const loops = profile.loops.map((loop) => {
      const wire = wireOfLoop(occt, profile, loop);
      held.push(wire);
      return pointsOf(occt, wire).map((point) => {
        const x = dot(sub(point, base), side);
        if (Math.abs(x) >= radius * (Math.PI / 2) * 0.98)
          throw new Refused(
            'This is wider than a quarter turn of the round face; make it smaller.',
          );
        return add(point, mul(side, radius * Math.sin(x / radius) - x));
      });
    });
    const [outer, ...holes] = loops;
    if (outer === undefined || outer.length < 3)
      throw new Refused('There is no closed shape to wrap.');
    let flat = occt.makeFace(polygon(occt, outer, held));
    held.push(flat);
    if (holes.length > 0) {
      flat = occt.addHolesInFace(
        flat,
        holes.map((hole) => polygon(occt, hole, held)),
      );
      held.push(flat);
    }
    // From just behind the plane to the axis: the near half of the face, never the far one.
    const start = occt.translate(flat, -inward.x, -inward.y, -inward.z);
    held.push(start);
    const prism = occt.extrude(
      start,
      inward.x * (reach + 1),
      inward.y * (reach + 1),
      inward.z * (reach + 1),
    );
    held.push(prism);
    // Long enough along the axis for anything drawn beside the face.
    const span = reach * 4 + uv.vMax - uv.vMin + 1000;
    const from = sub(base, mul(axis, span / 2));
    const surface = rod(occt, from, axis, radius, span);
    held.push(surface);
    if (depth > 0) {
      // The raised part: outside the face, inside the height it stands to.
      const outerRod = rod(occt, from, axis, radius + depth, span);
      held.push(outerRod);
      const reached = occt.common(prism, outerRod);
      held.push(reached);
      return occt.cut(reached, surface);
    }
    // The groove: inside the face and outside the floor it is cut down to.
    const within = occt.common(prism, surface);
    held.push(within);
    const innerRod = rod(occt, from, axis, Math.max(1e-3, radius + depth), span);
    held.push(innerRod);
    return occt.cut(within, innerRod);
  } finally {
    for (const shape of held) occt.release(shape);
  }
}
