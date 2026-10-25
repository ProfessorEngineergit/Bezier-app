/**
 * Topology optimisation: SIMP with a density filter (prevents checkerboards, sets the minimum
 * member size) and an optimality-criteria update. Elements on loaded or held faces stay solid.
 */

import { hex8Stiffness } from './hex8.js';
import type { Material, OptimisationSettings } from './model.js';
import { type GridSystem, type Placement, solveStatic } from './solve.js';

/** Void stiffness as a fraction of solid; keeps K non-singular. */
const VOID = 1e-6;
const MOVE = 0.2;

export interface OptimisationStep {
  iteration: number;
  /** f·u, N·mm. Lower is stiffer. */
  compliance: number;
  volumeFraction: number;
  /** Largest density change this step. */
  change: number;
}

export interface OptimisationResult {
  /** Physical (filtered) density per element, 0–1. */
  density: Float64Array;
  history: OptimisationStep[];
}

/** Elements that must stay solid: those on a face the study uses. */
export function nonDesign(system: GridSystem, placement: Pick<Placement, 'keptFaces'>): Uint8Array {
  const keep = new Uint8Array(system.elements.length);
  const elementOfVoxel = new Map<number, number>();
  system.elements.forEach((voxel, e) => {
    elementOfVoxel.set(voxel, e);
  });
  const { boundary } = system.grid;
  for (let b = 0; b < boundary.count; b++) {
    if (!placement.keptFaces.has(boundary.face[b] as number)) continue;
    const e = elementOfVoxel.get(boundary.voxel[b] as number);
    if (e !== undefined) keep[e] = 1;
  }
  return keep;
}

interface Filter {
  offsets: Uint32Array;
  neighbours: Uint32Array;
  weights: Float64Array;
  /** Row sums. */
  totals: Float64Array;
}

function buildFilter(system: GridSystem, radius: number): Filter {
  const { nx, ny, nz } = system.grid;
  const elementOfVoxel = new Int32Array(nx * ny * nz).fill(-1);
  system.elements.forEach((voxel, e) => {
    elementOfVoxel[voxel] = e;
  });
  const reach = Math.ceil(radius) - 1;
  const offsets = new Uint32Array(system.elements.length + 1);
  const neighbours: number[] = [];
  const weights: number[] = [];
  const totals = new Float64Array(system.elements.length);
  system.elements.forEach((voxel, e) => {
    const i = voxel % nx,
      j = Math.floor(voxel / nx) % ny,
      k = Math.floor(voxel / (nx * ny));
    let total = 0;
    for (let dk = -reach; dk <= reach; dk++)
      for (let dj = -reach; dj <= reach; dj++)
        for (let di = -reach; di <= reach; di++) {
          const a = i + di,
            b = j + dj,
            c = k + dk;
          if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
          const other = elementOfVoxel[a + nx * (b + ny * c)] as number;
          if (other < 0) continue;
          const weight = radius - Math.sqrt(di * di + dj * dj + dk * dk);
          if (weight <= 0) continue;
          neighbours.push(other);
          weights.push(weight);
          total += weight;
        }
    totals[e] = total;
    offsets[e + 1] = neighbours.length;
  });
  return {
    offsets,
    neighbours: Uint32Array.from(neighbours),
    weights: Float64Array.from(weights),
    totals,
  };
}

/** out = H·x / Hs (forward), or Hᵀ·(x / Hs) (adjoint, for sensitivities). */
function filter(f: Filter, x: Float64Array, out: Float64Array, adjoint: boolean): void {
  out.fill(0);
  for (let e = 0; e < x.length; e++) {
    for (let p = f.offsets[e] as number; p < (f.offsets[e + 1] as number); p++) {
      const other = f.neighbours[p] as number;
      const w = f.weights[p] as number;
      if (adjoint)
        out[other] = (out[other] as number) + (w * (x[e] as number)) / (f.totals[e] as number);
      else out[e] = (out[e] as number) + (w * (x[other] as number)) / (f.totals[e] as number);
    }
  }
}

export function optimise(
  system: GridSystem,
  material: Material,
  placement: Pick<Placement, 'fixed' | 'force' | 'keptFaces'>,
  settings: OptimisationSettings,
  onStep?: (step: OptimisationStep, density: Float64Array) => void,
): OptimisationResult {
  const count = system.elements.length;
  const keep = nonDesign(system, placement);
  const f = buildFilter(system, Math.max(1.01, settings.filterRadius));
  const ke = hex8Stiffness(material.youngsModulus, material.poissonRatio, system.grid.h);
  const target = Math.min(1, Math.max(0.05, settings.volumeFraction));

  const design = new Float64Array(count).fill(target);
  for (let e = 0; e < count; e++) if (keep[e] === 1) design[e] = 1;
  const physical = new Float64Array(count);
  const scale = new Float64Array(count);
  const sensitivity = new Float64Array(count);
  const filtered = new Float64Array(count);
  const volumeSensitivity = new Float64Array(count);
  const ones = new Float64Array(count).fill(1);
  filter(f, ones, volumeSensitivity, true);
  const history: OptimisationStep[] = [];
  let displacement: Float64Array | undefined;
  const ue = new Float64Array(24);

  for (let iteration = 0; iteration < settings.iterations; iteration++) {
    filter(f, design, physical, false);
    for (let e = 0; e < count; e++) {
      if (keep[e] === 1) physical[e] = 1;
      scale[e] = VOID + (physical[e] as number) ** settings.penalty * (1 - VOID);
    }
    const solved = solveStatic(system, material, placement, {
      scale,
      tolerance: 1e-4,
      ...(displacement === undefined ? {} : { initial: displacement }),
    });
    displacement = solved.displacement;

    let compliance = 0;
    for (let d = 0; d < displacement.length; d++)
      compliance += (placement.force[d] as number) * (displacement[d] as number);
    for (let e = 0; e < count; e++) {
      for (let n = 0; n < 8; n++) {
        const node = (system.elementNodes[e * 8 + n] as number) * 3;
        ue[n * 3] = displacement[node] as number;
        ue[n * 3 + 1] = displacement[node + 1] as number;
        ue[n * 3 + 2] = displacement[node + 2] as number;
      }
      let energy = 0;
      for (let r = 0; r < 24; r++) {
        let row = 0;
        for (let c = 0; c < 24; c++) row += (ke[r * 24 + c] as number) * (ue[c] as number);
        energy += (ue[r] as number) * row;
      }
      sensitivity[e] =
        -settings.penalty * (physical[e] as number) ** (settings.penalty - 1) * (1 - VOID) * energy;
    }
    filter(f, sensitivity, filtered, true);

    // Bisect the Lagrange multiplier so the filtered volume meets the target.
    let low = 0,
      high = 1e9;
    const next = new Float64Array(count);
    const nextPhysical = new Float64Array(count);
    while ((high - low) / (high + low) > 1e-4) {
      const mid = (low + high) / 2;
      for (let e = 0; e < count; e++) {
        if (keep[e] === 1) {
          next[e] = 1;
          continue;
        }
        const rho = design[e] as number;
        const factor = Math.sqrt(
          Math.max(0, -(filtered[e] as number)) / (mid * (volumeSensitivity[e] as number)),
        );
        next[e] = Math.max(
          0,
          Math.max(rho - MOVE, Math.min(1, Math.min(rho + MOVE, rho * factor))),
        );
      }
      filter(f, next, nextPhysical, false);
      let volume = 0;
      for (let e = 0; e < count; e++) volume += keep[e] === 1 ? 1 : (nextPhysical[e] as number);
      if (volume / count > target) low = mid;
      else high = mid;
    }

    let change = 0;
    let volume = 0;
    for (let e = 0; e < count; e++) {
      change = Math.max(change, Math.abs((next[e] as number) - (design[e] as number)));
      design[e] = next[e] as number;
      volume += physical[e] as number;
    }
    const step = { iteration, compliance, volumeFraction: volume / count, change };
    history.push(step);
    onStep?.(step, physical);
    if (change < 0.01 && iteration > 5) break;
  }

  filter(f, design, physical, false);
  for (let e = 0; e < count; e++) if (keep[e] === 1) physical[e] = 1;
  return { density: physical, history };
}
