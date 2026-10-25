/** Exact B-Rep visibility, discretised only after OCCT has classified the edges. */

import type { Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

export type DrawingDirection = 'front' | 'top' | 'right' | 'isometric';
export interface DrawingProjection {
  direction: DrawingDirection | 'section' | 'detail';
  /** Flattened x/y coordinates in model millimetres, one array per edge. */
  visible: number[][];
  hidden: number[][];
  /** Exact model vertices and their projection; never tessellation samples. */
  vertices?: { point: [number, number]; world: Vec3; depth: number }[];
}

export function projectBrep(
  kernel: Awaited<ReturnType<typeof loadOcct>>,
  shape: ReturnType<Awaited<ReturnType<typeof loadOcct>>['makeBox']>,
  direction: DrawingDirection,
): DrawingProjection {
  const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
  // [towards the viewer, sheet right]. OCCT's HLR projector looks down its main axis from
  // the positive side and returns edges already in its own plane: x along "sheet right", y
  // along main × right, which each basis here makes sheet up. Front looks from −Y, right
  // from +X, top from +Z, and the isometric from the front-right-top corner.
  const r3 = Math.sqrt(3);
  const r2 = Math.sqrt(2);
  const basis = {
    front: [v(0, -1, 0), v(1, 0, 0)],
    top: [v(0, 0, 1), v(1, 0, 0)],
    right: [v(1, 0, 0), v(0, 1, 0)],
    isometric: [v(1 / r3, -1 / r3, 1 / r3), v(1 / r2, 1 / r2, 0)],
  }[direction];
  const toViewer = basis[0];
  const right = basis[1];
  if (!toViewer || !right) throw new Error('Unknown drawing direction.');
  const result = kernel.projectEdges(shape, v(0, 0, 0), toViewer, right);
  const lines = (handle: typeof shape): number[][] => {
    if (Number(handle) === 0) return [];
    const { points, edgeGroups } = kernel.wireframe(handle, 0.01);
    const output: number[][] = [];
    for (let g = 0; g < edgeGroups.length; g += 3) {
      const start = edgeGroups[g] ?? 0;
      const count = edgeGroups[g + 1] ?? 0;
      const line: number[] = [];
      for (let i = start; i < start + count; i += 3) line.push(points[i] ?? 0, points[i + 1] ?? 0);
      if (line.length >= 4) output.push(line);
    }
    return output;
  };
  const up = v(
    toViewer.y * right.z - toViewer.z * right.y,
    toViewer.z * right.x - toViewer.x * right.z,
    toViewer.x * right.y - toViewer.y * right.x,
  );
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  try {
    const handles = kernel.getSubShapes(shape, 'vertex');
    const vertices: NonNullable<DrawingProjection['vertices']> = [];
    try {
      for (const handle of handles) {
        const world = kernel.vertexPosition(handle);
        vertices.push({
          point: [dot(world, right), dot(world, up)],
          world,
          depth: dot(world, toViewer),
        });
      }
    } finally {
      for (const handle of handles) kernel.release(handle);
    }
    return {
      direction,
      vertices,
      visible: [
        ...lines(result.visibleOutline),
        ...lines(result.visibleSharp),
        ...lines(result.visibleSmooth),
      ],
      hidden: [
        ...lines(result.hiddenOutline),
        ...lines(result.hiddenSharp),
        ...lines(result.hiddenSmooth),
      ],
    };
  } finally {
    for (const handle of new Set(Object.values(result)))
      if (Number(handle) !== 0) kernel.release(handle);
  }
}
