/** A true planar B-Rep intersection, independent of display mesh tessellation. */

import type { DrawingProjection } from './projection.js';
import type { Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type Raw = Awaited<ReturnType<typeof loadOcct>>;
export function sectionBrep(
  kernel: Raw,
  shape: ReturnType<Raw['makeBox']>,
  fraction: number,
): DrawingProjection {
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1)
    throw new Error('Place the section strictly inside the body.');
  const b = kernel.getBoundingBox(shape);
  const z = b.zmin + (b.zmax - b.zmin) * fraction;
  const margin = Math.max(b.xmax - b.xmin, b.ymax - b.ymin, 1);
  const corners = [
    { x: b.xmin - margin, y: b.ymin - margin, z },
    { x: b.xmax + margin, y: b.ymin - margin, z },
    { x: b.xmax + margin, y: b.ymax + margin, z },
    { x: b.xmin - margin, y: b.ymax + margin, z },
  ];
  const handles: ReturnType<Raw['makeBox']>[] = [];
  try {
    const edges = corners.map((p, i) => {
      const next = corners[(i + 1) % 4];
      if (!next) throw new Error('Invalid section plane.');
      const h = kernel.makeLineEdge(p, next);
      handles.push(h);
      return h;
    });
    const wire = kernel.makeWire(edges);
    handles.push(wire);
    const face = kernel.makeFace(wire);
    handles.push(face);
    const cut = kernel.section(shape, face);
    handles.push(cut);
    const { points, edgeGroups } = kernel.wireframe(cut, 0.01);
    const visible: number[][] = [];
    for (let g = 0; g < edgeGroups.length; g += 3) {
      const start = edgeGroups[g] ?? 0;
      const count = edgeGroups[g + 1] ?? 0;
      const line: number[] = [];
      for (let i = start; i < start + count; i += 3) line.push(points[i] ?? 0, points[i + 1] ?? 0);
      if (line.length >= 4) visible.push(line);
    }
    return { direction: 'section', visible, hidden: [] };
  } finally {
    for (const handle of handles.reverse()) kernel.release(handle);
  }
}

/**
 * Where a shape meets a plane, as world-space polylines, one per edge of the cut. Used as external
 * geometry for a sketch on that plane.
 */
export function sectionByPlaneBrep(
  kernel: Raw,
  shape: ReturnType<Raw['makeBox']>,
  plane: { origin: Vec3; normal: Vec3; xDirection: Vec3 },
): number[][] {
  const b = kernel.getBoundingBox(shape);
  const reach = Math.hypot(b.xmax - b.xmin, b.ymax - b.ymin, b.zmax - b.zmin) + 1;
  const n = plane.normal;
  const x = plane.xDirection;
  const y = { x: n.y * x.z - n.z * x.y, y: n.z * x.x - n.x * x.z, z: n.x * x.y - n.y * x.x };
  // The part's center projected onto the plane, and a square around it reaching past every side.
  const mid = { x: (b.xmin + b.xmax) / 2, y: (b.ymin + b.ymax) / 2, z: (b.zmin + b.zmax) / 2 };
  const off =
    (mid.x - plane.origin.x) * n.x +
    (mid.y - plane.origin.y) * n.y +
    (mid.z - plane.origin.z) * n.z;
  const c = { x: mid.x - n.x * off, y: mid.y - n.y * off, z: mid.z - n.z * off };
  const corner = (su: number, sv: number) => ({
    x: c.x + (x.x * su + y.x * sv) * reach,
    y: c.y + (x.y * su + y.y * sv) * reach,
    z: c.z + (x.z * su + y.z * sv) * reach,
  });
  const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  const handles: ReturnType<Raw['makeBox']>[] = [];
  try {
    const edges = corners.map((p, i) => {
      const h = kernel.makeLineEdge(p, corners[(i + 1) % 4] as Vec3);
      handles.push(h);
      return h;
    });
    const wire = kernel.makeWire(edges);
    handles.push(wire);
    const face = kernel.makeFace(wire);
    handles.push(face);
    const cut = kernel.section(shape, face);
    handles.push(cut);
    const { points, edgeGroups } = kernel.wireframe(cut, 0.01);
    const lines: number[][] = [];
    for (let g = 0; g < edgeGroups.length; g += 3) {
      const start = edgeGroups[g] ?? 0;
      const count = edgeGroups[g + 1] ?? 0;
      const line = Array.from(points.slice(start, start + count));
      if (line.length >= 6) lines.push(line);
    }
    return lines;
  } finally {
    for (const handle of handles.reverse()) kernel.release(handle);
  }
}
