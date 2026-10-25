/**
 * Measurements of picked faces and edges for orienting gizmos: edge direction, outward side, face
 * centre. Free functions over mesh data the viewport passes in.
 */

import type { FaceVertices } from './mesh.js';
import type { Outliner } from './outline.js';

/** The local frame of a picked edge: its direction and which way is out of the solid. */
export interface EdgeFrame {
  /** The unit vector along the edge. */
  tangent: { x: number; y: number; z: number };
  /** The sum of the two adjacent faces' normals. Not unit length. */
  outward: { x: number; y: number; z: number };
  /** Midpoint of an open edge, or the picked point on a closed seam. */
  snap: { x: number; y: number; z: number };
}

/** The buffers these measurements read. Null before any body has been set. */
export interface MeshFrames {
  faces: FaceVertices | null;
  /** The body's geometry, for positions and normals. */
  geometry: { getAttribute(name: string): AttributeLike } | null;
}

/** The slice of a Three.js `BufferAttribute` used here. */
interface AttributeLike {
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
}

/**
 * A face's normal. Bodies are never transformed after being built, so mesh normals are world
 * normals.
 */
export function faceNormalByIndex(
  mesh: MeshFrames,
  index: number,
): { x: number; y: number; z: number } | null {
  const { faces, geometry } = mesh;
  if (faces === null || geometry === null) return null;
  const start = faces.offsets[index];
  const end = faces.offsets[index + 1] ?? faces.vertices.length;
  if (start === undefined || end <= start) return null;
  // Averaged over the face: on a curved face one vertex's normal can point well away from the rest.
  const normals = geometry.getAttribute('normal');
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = start; i < end; i += 1) {
    const vertex = faces.vertices[i];
    if (vertex === undefined) continue;
    x += normals.getX(vertex);
    y += normals.getY(vertex);
    z += normals.getZ(vertex);
  }
  const length = Math.hypot(x, y, z);
  return length === 0 ? null : { x: x / length, y: y / length, z: z / length };
}

/** A curved face's normal must be read beside the picked seam, not averaged around its axis. */
export function faceNormalAt(
  mesh: MeshFrames,
  index: number,
  point: { x: number; y: number; z: number },
): { x: number; y: number; z: number } | null {
  const { faces, geometry } = mesh;
  if (!faces || !geometry) return null;
  const start = faces.offsets[index];
  if (start === undefined) return null;
  const end = faces.offsets[index + 1] ?? faces.vertices.length;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  let closest = Infinity;
  let best = -1;
  for (let i = start; i < end; i++) {
    const vertex = faces.vertices[i];
    if (vertex === undefined) continue;
    const distance =
      (positions.getX(vertex) - point.x) ** 2 +
      (positions.getY(vertex) - point.y) ** 2 +
      (positions.getZ(vertex) - point.z) ** 2;
    if (distance < closest) {
      closest = distance;
      best = vertex;
    }
  }
  return best < 0 ? null : { x: normals.getX(best), y: normals.getY(best), z: normals.getZ(best) };
}

/** The box around a face, for framing it. */
export function faceBoundsByIndex(
  mesh: MeshFrames,
  index: number,
): { min: [number, number, number]; max: [number, number, number] } | null {
  const { faces, geometry } = mesh;
  if (faces === null || geometry === null) return null;
  const start = faces.offsets[index];
  const end = faces.offsets[index + 1] ?? faces.vertices.length;
  if (start === undefined || end <= start) return null;
  const positions = geometry.getAttribute('position');
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < end; i++) {
    const vertex = faces.vertices[i];
    if (vertex === undefined) continue;
    const at = [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)] as const;
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis] ?? Infinity, at[axis] ?? 0);
      max[axis] = Math.max(max[axis] ?? -Infinity, at[axis] ?? 0);
    }
  }
  return { min, max };
}

/** A face's centre, averaged over its vertices, for anchoring a gizmo on the surface. */
export function faceCentroidByIndex(
  mesh: MeshFrames,
  index: number,
): { x: number; y: number; z: number } | null {
  const { faces, geometry } = mesh;
  if (faces === null || geometry === null) return null;
  const start = faces.offsets[index];
  const end = faces.offsets[index + 1] ?? faces.vertices.length;
  if (start === undefined || end <= start) return null;

  const positions = geometry.getAttribute('position');
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    const vertex = faces.vertices[i];
    if (vertex === undefined) continue;
    sx += positions.getX(vertex);
    sy += positions.getY(vertex);
    sz += positions.getZ(vertex);
    count++;
  }
  return count === 0 ? null : { x: sx / count, y: sy / count, z: sz / count };
}

/**
 * The local frame of the seam between two faces nearest `anchor`. `outward` is the sum of the two
 * normals (not unit, inexact for concave edges, enough to pick the handle's side). `snap` is the
 * anchor projected onto the seam, since the pick hit a face slightly off the edge.
 */
export function edgeFrameBetween(
  mesh: MeshFrames,
  outline: Outliner,
  a: number,
  b: number,
  anchor: { x: number; y: number; z: number },
): EdgeFrame | null {
  const seam = outline.seamBetween(a, b, anchor.x, anchor.y, anchor.z);
  if (seam === null) return null;
  const middle = outline.midpointBetween(a, b, anchor);

  const dx = seam.bx - seam.ax;
  const dy = seam.by - seam.ay;
  const dz = seam.bz - seam.az;
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return null;

  const na = faceNormalAt(mesh, a, anchor);
  const nb = faceNormalAt(mesh, b, anchor);
  const outward =
    na === null || nb === null
      ? { x: 0, y: 0, z: 0 }
      : { x: na.x + nb.x, y: na.y + nb.y, z: na.z + nb.z };

  const lenSq = length * length;
  const dot = (anchor.x - seam.ax) * dx + (anchor.y - seam.ay) * dy + (anchor.z - seam.az) * dz;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, dot / lenSq));

  return {
    tangent: middle?.tangent ?? { x: dx / length, y: dy / length, z: dz / length },
    outward,
    snap: middle?.point ?? { x: seam.ax + t * dx, y: seam.ay + t * dy, z: seam.az + t * dz },
  };
}
