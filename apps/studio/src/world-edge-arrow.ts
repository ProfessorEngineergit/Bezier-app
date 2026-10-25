/** A planar arrow fixed in model space; the camera only projects its vertices. */
import type { EdgeFrame } from '@bezier/renderer';
import type { ViewportHandle } from './Viewport.js';

type Point = { x: number; y: number; z: number };

export function worldEdgeArrow(frame: EdgeFrame, span: number) {
  const n = frame.outward;
  const length = Math.hypot(n.x, n.y, n.z);
  if (length < 1e-8) return null;
  const axis = { x: n.x / length, y: n.y / length, z: n.z / length };
  const t = frame.tangent;
  const side = {
    x: t.y * axis.z - t.z * axis.y,
    y: t.z * axis.x - t.x * axis.z,
    z: t.x * axis.y - t.y * axis.x,
  };
  const width = Math.hypot(side.x, side.y, side.z);
  if (width < 1e-8) return null;
  side.x /= width;
  side.y /= width;
  side.z /= width;
  const point = (along: number, across = 0): Point => ({
    x: frame.snap.x + span * (axis.x * along + side.x * across),
    y: frame.snap.y + span * (axis.y * along + side.y * across),
    z: frame.snap.z + span * (axis.z * along + side.z * across),
  });
  // The gap, shaft and both heads are fixed world distances, never screen offsets.
  const vertices = [
    point(0.35),
    point(1.35),
    point(0.6, -0.25),
    point(0.35),
    point(0.6, 0.25),
    point(1.1, -0.25),
    point(1.35),
    point(1.1, 0.25),
  ];
  return { vertices, centre: point(0.85), label: point(1.8) };
}

export function projectWorldArrow(
  handle: ViewportHandle,
  vertices: readonly Point[],
  origin: { x: number; y: number },
): string | null {
  let path = '';
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    if (!vertex) return null;
    const p = handle.project(vertex.x, vertex.y, vertex.z);
    if (!p) return null;
    path += `${i === 0 || i === 2 || i === 5 ? 'M' : 'L'}${p.x - origin.x} ${p.y - origin.y}`;
  }
  return path;
}
