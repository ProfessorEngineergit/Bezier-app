/**
 * Rounds larger than the faces beside the edge (e.g. R30 on a 15 mm block, audit F-009). OCCT's
 * rolling ball refuses them since the ball would run off its faces. For a straight edge between two
 * planar faces the round is the cylinder tangent to both planes, so the material between edge and
 * cylinder is cut away (a triangular prism less the cylinder), running past faces that are too
 * small. Curved edges or faces stay refused with OCCT's reason.
 */
import type { Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

/** The outward normal of a flat face of `solid`: the side away from the solid's middle. */
function outward(occt: RawKernel, face: RawHandle, middle: Vec3): Vec3 {
  const at = occt.getSurfaceCenterOfMass(face);
  const { u, v } = occt.uvFromPoint(face, at);
  const n = occt.surfaceNormal(face, u, v);
  return dot(n, sub(middle, at)) > 0 ? mul(n, -1) : n;
}

/**
 * The tool to cut from `solid` for a round of `radius` on `edge`, or null when the edge is not a
 * straight one between two flat faces. The caller owns the tool.
 */
export function overflowRoundTool(
  occt: RawKernel,
  solid: RawHandle,
  edge: RawHandle,
  radius: number,
): RawHandle | null {
  if (occt.curveType(edge) !== 'line') return null;
  const { first, last } = occt.curveParameters(edge);
  const a = occt.curvePointAtParam(edge, first);
  const b = occt.curvePointAtParam(edge, last);
  const faces = occt.getSubShapes(solid, 'face');
  const held: RawHandle[] = [...faces];
  try {
    const beside = faces.filter((face) => {
      const edges = occt.getSubShapes(face, 'edge');
      held.push(...edges);
      return edges.some((e) => occt.isSame(e, edge));
    });
    if (beside.length !== 2 || beside.some((f) => occt.surfaceType(f) !== 'plane')) return null;
    const middle = occt.getCenterOfMass(solid);
    const [n1, n2] = beside.map((f) => outward(occt, f as RawHandle, middle)) as [Vec3, Vec3];
    const k = dot(n1, n2);
    if (Math.abs(1 + k) < 1e-9 || Math.abs(1 - k) < 1e-9) return null;
    // The centre of the round's circle, `radius` inside both planes.
    const inward = mul(add(n1, n2), -radius / (1 + k));
    const along = sub(b, a);
    const span = length(along);
    // Past both ends, so the cut does not leave a sliver at the end faces.
    const margin = mul(along, (radius + span) / span);
    const start = sub(a, margin);
    const reach = add(along, mul(margin, 2));
    const centre = add(start, inward);
    // Where the circle touches each plane: the centre is `radius` inside it.
    const touch1 = add(centre, mul(n1, radius));
    const touch2 = add(centre, mul(n2, radius));
    // A little outside the corner, so the prism's sides are not on the faces' planes.
    const corner = sub(start, mul(inward, 0.05));
    const lines = [
      occt.makeLineEdge(corner, touch1),
      occt.makeLineEdge(touch1, touch2),
      occt.makeLineEdge(touch2, corner),
    ];
    held.push(...lines);
    const triangle = occt.makeWire(lines);
    held.push(triangle);
    const triangleFace = occt.makeFace(triangle);
    held.push(triangleFace);
    const wedge = occt.extrude(triangleFace, reach.x, reach.y, reach.z);
    held.push(wedge);
    // A true cylinder, placed: OCCT's primitive runs up Z from the origin.
    const z = mul(reach, 1 / length(reach));
    const helper = Math.abs(z.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const xAxis = mul(sub(helper, mul(z, dot(helper, z))), 1);
    const x = mul(xAxis, 1 / length(xAxis));
    const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x };
    const upright = occt.makeCylinder(radius, length(reach));
    held.push(upright);
    const rod = occt.transform(upright, [
      x.x,
      y.x,
      z.x,
      centre.x,
      x.y,
      y.y,
      z.y,
      centre.y,
      x.z,
      y.z,
      z.z,
      centre.z,
    ]);
    held.push(rod);
    return occt.cut(wedge, rod);
  } finally {
    for (const shape of held) occt.release(shape);
  }
}

/**
 * OCCT's round of `radius` on `edges`, with history; where OCCT refuses one edge between flat
 * faces, the round that takes those faces over. Any other refusal is OCCT's, with its reason.
 */
export function roundOrOverflow(
  occt: RawKernel,
  solid: RawHandle,
  edges: readonly RawHandle[],
  radius: number,
  hashes: Parameters<RawKernel['filletWithHistory']>[3],
  bound: number,
): ReturnType<RawKernel['filletWithHistory']> {
  try {
    return occt.filletWithHistory(solid, [...edges], radius, hashes, bound);
  } catch (refused) {
    const [edge] = edges;
    const tool =
      edges.length === 1 && edge !== undefined
        ? overflowRoundTool(occt, solid, edge, radius)
        : null;
    if (tool === null) throw refused;
    let cut: ReturnType<RawKernel['cutWithHistory']>;
    try {
      cut = occt.cutWithHistory(solid, tool, hashes, bound);
    } finally {
      occt.release(tool);
    }
    // A round so large it would take the whole part away is still one that does not fit.
    if (Math.abs(occt.getVolume(cut.result)) > 1e-6 * Math.abs(occt.getVolume(solid))) return cut;
    occt.release(cut.result);
    throw refused;
  }
}
