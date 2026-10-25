/**
 * The planar faces of a shape as outlines on their planes, so a STEP file of loose surfaces can be
 * sketched on and lofted (audit F-017). Straight edges give their two ends, curved ones sampled
 * points. Outer boundary first, then holes.
 */
import { planeOfFace } from './occt-support.js';
import type { Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

export interface FaceOutline {
  /** A point on the plane, and the plane's normal. */
  origin: Vec3;
  normal: Vec3;
  /** Closed point loops, outer first; the last point does not repeat the first. */
  loops: Vec3[][];
}

/** Points along a curved edge. */
const SAMPLES = 24;
const near = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-4;

/** One wire's edges as a single loop of points, edges joined end to end whichever way they run. */
function loopOf(occt: RawKernel, wire: RawHandle): Vec3[] {
  const edges = occt.getSubShapes(wire, 'edge');
  try {
    const runs = edges.map((edge) => {
      const { first, last } = occt.curveParameters(edge);
      const count = occt.curveType(edge) === 'line' ? 1 : SAMPLES;
      return Array.from({ length: count + 1 }, (_, i) =>
        occt.curvePointAtParam(edge, first + ((last - first) * i) / count),
      );
    });
    const [start, ...rest] = runs;
    if (start === undefined) return [];
    const loop = [...start];
    while (rest.length > 0) {
      const end = loop[loop.length - 1] as Vec3;
      const index = rest.findIndex(
        (run) => near(run[0] as Vec3, end) || near(run[run.length - 1] as Vec3, end),
      );
      if (index < 0) break;
      const [run] = rest.splice(index, 1);
      if (run === undefined) break;
      const forward = near(run[0] as Vec3, end) ? run : [...run].reverse();
      loop.push(...forward.slice(1));
    }
    if (loop.length > 1 && near(loop[0] as Vec3, loop[loop.length - 1] as Vec3)) loop.pop();
    return loop;
  } finally {
    for (const edge of edges) occt.release(edge);
  }
}

export function faceOutlines(occt: RawKernel, shape: RawHandle): FaceOutline[] {
  const faces = occt.getSubShapes(shape, 'face');
  const out: FaceOutline[] = [];
  try {
    for (const face of faces) {
      if (occt.surfaceType(face) !== 'plane') continue;
      const { origin, normal } = planeOfFace(occt, face);
      const outer = occt.outerWire(face);
      const wires = occt.getSubShapes(face, 'wire');
      try {
        const holes = wires.filter((wire) => !occt.isSame(wire, outer));
        const loops = [loopOf(occt, outer), ...holes.map((wire) => loopOf(occt, wire))];
        if ((loops[0]?.length ?? 0) >= 3) out.push({ origin, normal, loops });
      } finally {
        occt.release(outer);
        for (const wire of wires) occt.release(wire);
      }
    }
  } finally {
    for (const face of faces) occt.release(face);
  }
  return out;
}
