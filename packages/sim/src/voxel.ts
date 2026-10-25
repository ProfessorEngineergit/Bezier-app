/**
 * Voxelises a triangle mesh and tags each exposed voxel side with its B-Rep face.
 *
 * Solidity uses ray parity along +Z per (i, j) column. The ray is offset from the cell centre by
 * an irrational fraction so it never runs along a shared edge and counts a crossing twice. Face
 * tagging uses a spatial bin of triangles, so its cost follows the boundary, not the volume.
 */

export interface SurfaceMesh {
  positions: Float32Array;
  indices: Uint32Array;
  /** Face index per triangle (`Mesh.triangleFaces`). */
  triangleFaces: Uint32Array;
}

/** −x, +x, −y, +y, −z, +z. */
export type Side = 0 | 1 | 2 | 3 | 4 | 5;

export interface VoxelGrid {
  nx: number;
  ny: number;
  nz: number;
  /** Edge length of one voxel, mm. */
  h: number;
  /** Corner of voxel (0, 0, 0). */
  origin: [number, number, number];
  /** 1 where the voxel is inside the part. Index `i + nx * (j + ny * k)`. */
  solid: Uint8Array;
  solidCount: number;
  /** Exposed voxel sides: which voxel, which side, which B-Rep face it lies on. */
  boundary: { voxel: Uint32Array; side: Uint8Array; face: Int32Array; count: number };
}

export function voxelIndex(
  grid: Pick<VoxelGrid, 'nx' | 'ny'>,
  i: number,
  j: number,
  k: number,
): number {
  return i + grid.nx * (j + grid.ny * k);
}

export function voxelise(surface: SurfaceMesh, targetElements: number): VoxelGrid {
  const { positions, indices } = surface;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < positions.length; v += 3) {
    for (let a = 0; a < 3; a++) {
      const value = positions[v + a] as number;
      if (value < (min[a] as number)) min[a] = value;
      if (value > (max[a] as number)) max[a] = value;
    }
  }
  const size = [0, 1, 2].map((a) => Math.max((max[a] as number) - (min[a] as number), 1e-6));
  // Sized on the bounding box; a second pass to hit the target exactly is not worth it.
  const h = Math.cbrt(
    ((size[0] as number) * (size[1] as number) * (size[2] as number)) / targetElements,
  );
  const nx = Math.max(2, Math.ceil((size[0] as number) / h));
  const ny = Math.max(2, Math.ceil((size[1] as number) / h));
  const nz = Math.max(2, Math.ceil((size[2] as number) / h));
  // Centre the grid on the part so the half-cell of slack is shared.
  const origin: [number, number, number] = [
    (min[0] as number) - (nx * h - (size[0] as number)) / 2,
    (min[1] as number) - (ny * h - (size[1] as number)) / 2,
    (min[2] as number) - (nz * h - (size[2] as number)) / 2,
  ];

  const triangleCount = indices.length / 3;
  const columns: number[][] = Array.from({ length: nx * ny }, () => []);
  const nudgeX = h * 1.1e-4 * Math.SQRT2;
  const nudgeY = h * 0.7e-4 * Math.PI;

  for (let t = 0; t < triangleCount; t++) {
    const a = (indices[t * 3] as number) * 3;
    const b = (indices[t * 3 + 1] as number) * 3;
    const c = (indices[t * 3 + 2] as number) * 3;
    const ax = positions[a] as number,
      ay = positions[a + 1] as number,
      az = positions[a + 2] as number;
    const bx = positions[b] as number,
      by = positions[b + 1] as number,
      bz = positions[b + 2] as number;
    const cx = positions[c] as number,
      cy = positions[c + 1] as number,
      cz = positions[c + 2] as number;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-18) continue; // edge-on to the ray: no crossing
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - origin[0]) / h - 0.5));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - origin[0]) / h - 0.5));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - origin[1]) / h - 0.5));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - origin[1]) / h - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = origin[1] + (j + 0.5) * h + nudgeY;
      for (let i = i0; i <= i1; i++) {
        const px = origin[0] + (i + 0.5) * h + nudgeX;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        (columns[i + nx * j] as number[]).push(l1 * az + l2 * bz + l3 * cz);
      }
    }
  }

  const solid = new Uint8Array(nx * ny * nz);
  let solidCount = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const hits = (columns[i + nx * j] as number[]).sort((p, q) => p - q);
      for (let pair = 0; pair + 1 < hits.length; pair += 2) {
        const zIn = hits[pair] as number;
        const zOut = hits[pair + 1] as number;
        const k0 = Math.max(0, Math.ceil((zIn - origin[2]) / h - 0.5));
        const k1 = Math.min(nz - 1, Math.floor((zOut - origin[2]) / h - 0.5));
        for (let k = k0; k <= k1; k++) {
          const e = i + nx * (j + ny * k);
          if (solid[e] === 0) {
            solid[e] = 1;
            solidCount++;
          }
        }
      }
    }
  }

  const grid: VoxelGrid = {
    nx,
    ny,
    nz,
    h,
    origin,
    solid,
    solidCount,
    boundary: {
      voxel: new Uint32Array(0),
      side: new Uint8Array(0),
      face: new Int32Array(0),
      count: 0,
    },
  };
  grid.boundary = tagBoundary(grid, surface);
  return grid;
}

const SIDE_STEP: readonly (readonly [number, number, number])[] = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

function tagBoundary(grid: VoxelGrid, surface: SurfaceMesh): VoxelGrid['boundary'] {
  const { nx, ny, nz, h, origin, solid } = grid;
  const voxels: number[] = [];
  const sides: number[] = [];
  const points: number[] = [];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const e = i + nx * (j + ny * k);
        if (solid[e] === 0) continue;
        for (let s = 0; s < 6; s++) {
          const [di, dj, dk] = SIDE_STEP[s] as readonly [number, number, number];
          const ni = i + di,
            nj = j + dj,
            nk = k + dk;
          const outside = ni < 0 || nj < 0 || nk < 0 || ni >= nx || nj >= ny || nk >= nz;
          if (!outside && solid[ni + nx * (nj + ny * nk)] === 1) continue;
          voxels.push(e);
          sides.push(s);
          points.push(
            origin[0] + (i + 0.5 + di * 0.5) * h,
            origin[1] + (j + 0.5 + dj * 0.5) * h,
            origin[2] + (k + 0.5 + dk * 0.5) * h,
          );
        }
      }
    }
  }
  const nearest = nearestFaces(surface, points, h * 2);
  return {
    voxel: Uint32Array.from(voxels),
    side: Uint8Array.from(sides),
    face: nearest,
    count: voxels.length,
  };
}

/** For each query point, the face index of the nearest triangle. */
function nearestFaces(surface: SurfaceMesh, points: number[], cell: number): Int32Array {
  const { positions, indices, triangleFaces } = surface;
  const bins = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const triangleCount = indices.length / 3;
  for (let t = 0; t < triangleCount; t++) {
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 3; c++) {
      const v = (indices[t * 3 + c] as number) * 3;
      lo = lo.map((m, a) => Math.min(m, positions[v + a] as number));
      hi = hi.map((m, a) => Math.max(m, positions[v + a] as number));
    }
    for (
      let x = Math.floor((lo[0] as number) / cell);
      x <= Math.floor((hi[0] as number) / cell);
      x++
    )
      for (
        let y = Math.floor((lo[1] as number) / cell);
        y <= Math.floor((hi[1] as number) / cell);
        y++
      )
        for (
          let z = Math.floor((lo[2] as number) / cell);
          z <= Math.floor((hi[2] as number) / cell);
          z++
        ) {
          const bin = bins.get(key(x, y, z));
          if (bin === undefined) bins.set(key(x, y, z), [t]);
          else bin.push(t);
        }
  }

  const result = new Int32Array(points.length / 3).fill(-1);
  for (let p = 0; p < result.length; p++) {
    const px = points[p * 3] as number,
      py = points[p * 3 + 1] as number,
      pz = points[p * 3 + 2] as number;
    const bx = Math.floor(px / cell),
      by = Math.floor(py / cell),
      bz = Math.floor(pz / cell);
    let best = Infinity;
    // Widen the ring until a triangle is found; boundary points are within half a voxel of the
    // surface, so one ring is usually enough.
    for (let ring = 1; ring <= 4 && result[p] === -1; ring++) {
      for (let x = bx - ring; x <= bx + ring; x++)
        for (let y = by - ring; y <= by + ring; y++)
          for (let z = bz - ring; z <= bz + ring; z++) {
            const bin = bins.get(key(x, y, z));
            if (bin === undefined) continue;
            for (const t of bin) {
              const d = pointTriangleDistanceSq(px, py, pz, positions, indices, t);
              if (d < best) {
                best = d;
                result[p] = triangleFaces[t] as number;
              }
            }
          }
    }
  }
  return result;
}

/** Squared distance from a point to triangle `t` (Ericson, Real-Time Collision Detection 5.1.5). */
export function pointTriangleDistanceSq(
  px: number,
  py: number,
  pz: number,
  positions: Float32Array,
  indices: Uint32Array,
  t: number,
): number {
  const a = (indices[t * 3] as number) * 3,
    b = (indices[t * 3 + 1] as number) * 3,
    c = (indices[t * 3 + 2] as number) * 3;
  const ax = positions[a] as number,
    ay = positions[a + 1] as number,
    az = positions[a + 2] as number;
  const abx = (positions[b] as number) - ax,
    aby = (positions[b + 1] as number) - ay,
    abz = (positions[b + 2] as number) - az;
  const acx = (positions[c] as number) - ax,
    acy = (positions[c + 1] as number) - ay,
    acz = (positions[c + 2] as number) - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) {
    qx = ax;
    qy = ay;
    qz = az;
  } else {
    const bpx = px - ax - abx,
      bpy = py - ay - aby,
      bpz = pz - az - abz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = px - ax - acx,
      cpy = py - ay - acy,
      cpz = pz - az - acz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2,
      vb = d5 * d2 - d1 * d6,
      va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      qx = ax + abx;
      qy = ay + aby;
      qz = az + abz;
    } else if (d6 >= 0 && d5 <= d6) {
      qx = ax + acx;
      qy = ay + acy;
      qz = az + acz;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      qx = ax + v * abx;
      qy = ay + v * aby;
      qz = az + v * abz;
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      qx = ax + w * acx;
      qy = ay + w * acy;
      qz = az + w * acz;
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      qx = ax + abx + w * (acx - abx);
      qy = ay + aby + w * (acy - aby);
      qz = az + abz + w * (acz - abz);
    } else {
      const denom = 1 / (va + vb + vc);
      const v = vb * denom,
        w = vc * denom;
      qx = ax + abx * v + acx * w;
      qy = ay + aby * v + acy * w;
      qz = az + abz * v + acz * w;
    }
  }
  const dx = px - qx,
    dy = py - qy,
    dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}
