/**
 * Post-processing for display. Stress is evaluated at element centres, averaged to nodes and
 * sampled trilinearly at the kernel tessellation's vertices, so no voxel staircase is shown.
 */

import { elasticity, strainMatrix } from './hex8.js';
import type { Material } from './model.js';
import type { GridSystem } from './solve.js';

export function vonMisesOf(s: ArrayLike<number>): number {
  const xx = s[0] as number,
    yy = s[1] as number,
    zz = s[2] as number;
  const xy = s[3] as number,
    yz = s[4] as number,
    zx = s[5] as number;
  return Math.sqrt(
    0.5 * ((xx - yy) ** 2 + (yy - zz) ** 2 + (zz - xx) ** 2) + 3 * (xy * xy + yz * yz + zx * zx),
  );
}

/** Centre stress per element: 6 Voigt components, MPa. */
export function elementStress(
  system: GridSystem,
  material: Material,
  displacement: Float64Array,
  scale?: Float64Array,
): Float64Array {
  const d = elasticity(material.youngsModulus, material.poissonRatio);
  const b = strainMatrix(0, 0, 0, system.grid.h);
  const count = system.elements.length;
  const stress = new Float64Array(count * 6);
  const ue = new Float64Array(24);
  const strain = new Float64Array(6);
  for (let e = 0; e < count; e++) {
    for (let n = 0; n < 8; n++) {
      const node = (system.elementNodes[e * 8 + n] as number) * 3;
      ue[n * 3] = displacement[node] as number;
      ue[n * 3 + 1] = displacement[node + 1] as number;
      ue[n * 3 + 2] = displacement[node + 2] as number;
    }
    for (let r = 0; r < 6; r++) {
      let sum = 0;
      for (let c = 0; c < 24; c++) sum += (b[r * 24 + c] as number) * (ue[c] as number);
      strain[r] = sum;
    }
    const s = scale === undefined ? 1 : (scale[e] as number);
    for (let r = 0; r < 6; r++) {
      let sum = 0;
      for (let c = 0; c < 6; c++) sum += (d[r * 6 + c] as number) * (strain[c] as number);
      stress[e * 6 + r] = s * sum;
    }
  }
  return stress;
}

/** Averages element values onto the grid nodes they touch. */
export function nodalAverage(system: GridSystem, elementValues: ArrayLike<number>): Float32Array {
  const sum = new Float64Array(system.nodeCount);
  const hits = new Uint16Array(system.nodeCount);
  for (let e = 0; e < system.elements.length; e++) {
    const value = elementValues[e] as number;
    for (let n = 0; n < 8; n++) {
      const node = system.elementNodes[e * 8 + n] as number;
      sum[node] = (sum[node] as number) + value;
      hits[node] = (hits[node] as number) + 1;
    }
  }
  const out = new Float32Array(system.nodeCount);
  for (let node = 0; node < out.length; node++) {
    const count = hits[node] as number;
    if (count > 0) out[node] = (sum[node] as number) / count;
  }
  return out;
}

export interface StaticSummary {
  maxVonMises: number;
  maxDisplacement: number;
  /** Yield over peak von Mises; Infinity when unstressed. */
  minSafetyFactor: number;
  /** Sum of applied forces, N, equal and opposite to the reactions. */
  appliedForce: [number, number, number];
}

export interface StaticFields {
  /** Per element, MPa. */
  vonMises: Float32Array;
  /** Per grid node, MPa. */
  nodalVonMises: Float32Array;
  /** Per grid node, mm. */
  nodalDisplacement: Float32Array;
  summary: StaticSummary;
}

export function staticFields(
  system: GridSystem,
  material: Material,
  displacement: Float64Array,
  force: Float64Array,
): StaticFields {
  const stress = elementStress(system, material, displacement);
  const count = system.elements.length;
  const vonMises = new Float32Array(count);
  let maxVonMises = 0;
  for (let e = 0; e < count; e++) {
    const value = vonMisesOf(stress.subarray(e * 6, e * 6 + 6));
    vonMises[e] = value;
    if (value > maxVonMises) maxVonMises = value;
  }
  const nodalDisplacement = new Float32Array(system.nodeCount);
  let maxDisplacement = 0;
  for (let node = 0; node < system.nodeCount; node++) {
    const m = Math.hypot(
      displacement[node * 3] as number,
      displacement[node * 3 + 1] as number,
      displacement[node * 3 + 2] as number,
    );
    nodalDisplacement[node] = m;
    if (m > maxDisplacement) maxDisplacement = m;
  }
  const appliedForce: [number, number, number] = [0, 0, 0];
  for (let d = 0; d < force.length; d++) {
    const axis = d % 3;
    appliedForce[axis] = (appliedForce[axis] as number) + (force[d] as number);
  }
  return {
    vonMises,
    nodalVonMises: nodalAverage(system, vonMises),
    nodalDisplacement,
    summary: {
      maxVonMises,
      maxDisplacement,
      minSafetyFactor: maxVonMises > 0 ? material.yieldStrength / maxVonMises : Infinity,
      appliedForce,
    },
  };
}

/**
 * The voxel containing a point, with local coordinates. A vertex outside every solid voxel (the
 * staircase undercuts the surface) maps to the nearest solid neighbour, coordinates clamped.
 */
function locate(
  system: GridSystem,
  x: number,
  y: number,
  z: number,
): [number, number, number, number] | null {
  const { nx, ny, nz, h, origin, solid } = system.grid;
  const u = (x - origin[0]) / h,
    v = (y - origin[1]) / h,
    w = (z - origin[2]) / h;
  const i = Math.min(nx - 1, Math.max(0, Math.floor(u)));
  const j = Math.min(ny - 1, Math.max(0, Math.floor(v)));
  const k = Math.min(nz - 1, Math.max(0, Math.floor(w)));
  let best: [number, number, number] | null = solid[i + nx * (j + ny * k)] === 1 ? [i, j, k] : null;
  if (best === null) {
    let bestDistance = Infinity;
    for (let dk = -1; dk <= 1; dk++)
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const a = i + di,
            b = j + dj,
            c = k + dk;
          if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
          if (solid[a + nx * (b + ny * c)] === 0) continue;
          const distance = (u - a - 0.5) ** 2 + (v - b - 0.5) ** 2 + (w - c - 0.5) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = [a, b, c];
          }
        }
  }
  if (best === null) return null;
  const [a, b, c] = best;
  const px = nx + 1,
    py = ny + 1;
  const clamp = (t: number) => Math.min(1, Math.max(0, t));
  return [a + px * (b + py * c), clamp(u - a), clamp(v - b), clamp(w - c)];
}

/**
 * Samples a per-node field trilinearly at `points` (xyz triples). `components` is 1 for a scalar,
 * 3 for displacement. Points far from the part get zeros.
 */
export function sampleField(
  system: GridSystem,
  field: ArrayLike<number>,
  points: ArrayLike<number>,
  components: 1 | 3,
): Float32Array {
  const count = points.length / 3;
  const out = new Float32Array(count * components);
  const px = system.grid.nx + 1,
    pxy = px * (system.grid.ny + 1);
  for (let p = 0; p < count; p++) {
    const hit = locate(
      system,
      points[p * 3] as number,
      points[p * 3 + 1] as number,
      points[p * 3 + 2] as number,
    );
    if (hit === null) continue;
    const [base, fx, fy, fz] = hit;
    for (let c = 0; c < components; c++) {
      let value = 0;
      for (let corner = 0; corner < 8; corner++) {
        const a = corner & 1,
          b = (corner >> 1) & 1,
          cz = (corner >> 2) & 1;
        const weight = (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (cz ? fz : 1 - fz);
        if (weight === 0) continue;
        const node = base + a + px * b + pxy * cz;
        value += weight * (field[node * components + c] as number);
      }
      out[p * components + c] = value;
    }
  }
  return out;
}
