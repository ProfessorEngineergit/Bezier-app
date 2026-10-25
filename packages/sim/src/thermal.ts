/**
 * Steady-state heat conduction on the voxel grid, reusing the static solve's grid, face tagging and
 * matrix-free CG with one unknown per node (phase 3 of `docs/simulation/ARCHITECTURE.md`).
 * Units: mm, W, °C. Inputs in W/(m·K) and W/(m²·K) are converted to millimetres here only.
 */

import { HEX_NODES } from './hex8.js';
import type { Material, ThermalCondition } from './model.js';
import { type GridSystem, sideNodes } from './solve.js';

/**
 * The 8×8 conduction matrix of a unit cube for a conductivity of 1, 2×2×2 Gauss. For a cube of edge
 * h and conductivity k it is `k · h · K₁`: the gradients scale with 1/h and the volume with h³.
 */
export function hex8Conduction(): Float64Array {
  const k = new Float64Array(64);
  const g = 1 / Math.sqrt(3);
  const grad = new Float64Array(24);
  for (const xi of [-g, g])
    for (const eta of [-g, g])
      for (const zeta of [-g, g]) {
        for (let n = 0; n < 8; n++) {
          const [a, b, c] = HEX_NODES[n] as readonly [number, number, number];
          const sx = 2 * a - 1,
            sy = 2 * b - 1,
            sz = 2 * c - 1;
          // dN/dx on a unit cube: dξ/dx = 2, and the shape function's 1/8.
          grad[n * 3] = (2 * sx * (1 + eta * sy) * (1 + zeta * sz)) / 8;
          grad[n * 3 + 1] = (2 * sy * (1 + xi * sx) * (1 + zeta * sz)) / 8;
          grad[n * 3 + 2] = (2 * sz * (1 + xi * sx) * (1 + eta * sy)) / 8;
        }
        const weight = 1 / 8; // detJ of the unit cube, (1/2)³, times the unit Gauss weights.
        for (let r = 0; r < 8; r++)
          for (let c = 0; c < 8; c++)
            k[r * 8 + c] =
              (k[r * 8 + c] as number) +
              weight *
                ((grad[r * 3] as number) * (grad[c * 3] as number) +
                  (grad[r * 3 + 1] as number) * (grad[c * 3 + 1] as number) +
                  (grad[r * 3 + 2] as number) * (grad[c * 3 + 2] as number));
      }
  return k;
}

export interface ThermalPlacement {
  /** 1 where the node's temperature is given. */
  fixed: Uint8Array;
  /** The given temperatures, °C, where `fixed`. */
  given: Float64Array;
  /** Heat entering each node, W, from heaters and from the air side of a film. */
  heat: Float64Array;
  /** Film conductance at each node, W/K. */
  film: Float64Array;
  keptFaces: Set<number>;
  issues: string[];
}

/** Converts thermal conditions into fixed temperatures, nodal heat and film conductance. */
export function placeThermal(
  system: GridSystem,
  conditions: readonly ThermalCondition[],
  faceIndex: ReadonlyMap<string, number>,
): ThermalPlacement {
  const { grid, elementNodes } = system;
  const nodes = system.nodeCount;
  const fixed = new Uint8Array(nodes);
  const given = new Float64Array(nodes);
  const heat = new Float64Array(nodes);
  const film = new Float64Array(nodes);
  const keptFaces = new Set<number>();
  const issues: string[] = [];

  const used = new Uint8Array(nodes);
  for (let e = 0; e < system.elements.length; e++)
    for (let n = 0; n < 8; n++) used[elementNodes[e * 8 + n] as number] = 1;
  const elementOfVoxel = new Int32Array(grid.nx * grid.ny * grid.nz).fill(-1);
  system.elements.forEach((voxel, e) => {
    elementOfVoxel[voxel] = e;
  });

  const sidesOn = (keys: readonly string[]): [number, number][] => {
    const wanted = new Set<number>();
    for (const key of keys) {
      const index = faceIndex.get(key);
      if (index === undefined)
        issues.push('A face used by a thermal condition is no longer on the part.');
      else wanted.add(index);
    }
    const found: [number, number][] = [];
    const { boundary } = grid;
    for (let b = 0; b < boundary.count; b++) {
      if (!wanted.has(boundary.face[b] as number)) continue;
      const element = elementOfVoxel[boundary.voxel[b] as number] as number;
      if (element >= 0) found.push([element, boundary.side[b] as number]);
    }
    for (const index of wanted) keptFaces.add(index);
    return found;
  };

  const area = grid.h * grid.h;
  for (const condition of conditions) {
    const sides = sidesOn(condition.faces);
    if (sides.length === 0) continue;
    for (const [element, side] of sides) {
      for (const local of sideNodes(side)) {
        const node = elementNodes[element * 8 + local] as number;
        if (condition.kind === 'temperature') {
          fixed[node] = 1;
          given[node] = condition.temperature;
        } else if (condition.kind === 'heat') {
          // Shared by count, like a force, so the total equals the input exactly.
          heat[node] = (heat[node] as number) + condition.power / sides.length / 4;
        } else {
          // Lumped onto the side's four corners: W/(m²·K) to W/(mm²·K), times a quarter of the side.
          const conductance = (condition.coefficient * 1e-6 * area) / 4;
          film[node] = (film[node] as number) + conductance;
          heat[node] = (heat[node] as number) + conductance * condition.ambient;
        }
      }
    }
  }
  // Nodes no element touches are given 0 °C and stay out of the solve.
  for (let node = 0; node < nodes; node++) if (used[node] === 0) fixed[node] = 1;

  const anchored = conditions.some((c) => c.kind === 'temperature' || c.kind === 'convection');
  if (!anchored)
    issues.push(
      'Add a Temperature or a Convection. Without somewhere for the heat to go, the part has no temperature to settle at.',
    );
  if (conditions.length === 0)
    issues.push('Add a thermal condition: Temperature, Heat or Convection.');
  return { fixed, given, heat, film, keptFaces, issues };
}

/** y = K·x + film ⊙ x over the solid elements. */
function applyConduction(
  system: GridSystem,
  ke: Float64Array,
  film: Float64Array,
  x: Float64Array,
  y: Float64Array,
): void {
  for (let node = 0; node < y.length; node++)
    y[node] = (film[node] as number) * (x[node] as number);
  const { elementNodes } = system;
  const te = new Float64Array(8);
  for (let e = 0; e < system.elements.length; e++) {
    for (let n = 0; n < 8; n++) te[n] = x[elementNodes[e * 8 + n] as number] as number;
    for (let r = 0; r < 8; r++) {
      let sum = 0;
      for (let c = 0; c < 8; c++) sum += (ke[r * 8 + c] as number) * (te[c] as number);
      const node = elementNodes[e * 8 + r] as number;
      y[node] = (y[node] as number) + sum;
    }
  }
}

export interface ThermalSolve {
  /** Per grid node, °C. */
  temperature: Float64Array;
  iterations: number;
  relativeResidual: number;
  converged: boolean;
}

/** Jacobi-preconditioned conjugate gradient for the nodal temperatures. */
export function solveThermal(
  system: GridSystem,
  material: Material,
  placement: ThermalPlacement,
  options: {
    tolerance?: number;
    maxIterations?: number;
    onProgress?: (i: number, r: number) => void;
  } = {},
): ThermalSolve {
  const { fixed, given, heat, film } = placement;
  const n = system.nodeCount;
  const k = material.conductivity * 1e-3 * system.grid.h; // W/(m·K) → W/(mm·K), times h.
  const unit = hex8Conduction();
  const ke = new Float64Array(64);
  for (let i = 0; i < 64; i++) ke[i] = (unit[i] as number) * k;
  const { tolerance = 1e-8, maxIterations = 6000, onProgress } = options;

  const diagonal = new Float64Array(n);
  for (let node = 0; node < n; node++) diagonal[node] = film[node] as number;
  for (let e = 0; e < system.elements.length; e++)
    for (let r = 0; r < 8; r++) {
      const node = system.elementNodes[e * 8 + r] as number;
      diagonal[node] = (diagonal[node] as number) + (ke[r * 8 + r] as number);
    }

  // Fixed temperatures first; the solve finds the rest.
  const t = new Float64Array(n);
  for (let node = 0; node < n; node++) if (fixed[node] === 1) t[node] = given[node] as number;
  const q = new Float64Array(n);
  applyConduction(system, ke, film, t, q);
  const r = new Float64Array(n);
  let rhsNorm = 0;
  for (let node = 0; node < n; node++) {
    if (fixed[node] === 1) continue;
    r[node] = (heat[node] as number) - (q[node] as number);
    rhsNorm += (r[node] as number) ** 2;
  }
  rhsNorm = Math.sqrt(rhsNorm);
  if (rhsNorm === 0) return { temperature: t, iterations: 0, relativeResidual: 0, converged: true };

  const z = new Float64Array(n);
  const p = new Float64Array(n);
  let rz = 0;
  for (let node = 0; node < n; node++) {
    if (fixed[node] === 1) continue;
    const d = diagonal[node] as number;
    z[node] = d > 0 ? (r[node] as number) / d : 0;
    p[node] = z[node] as number;
    rz += (r[node] as number) * (z[node] as number);
  }
  let iteration = 0;
  let relative = 1;
  for (; iteration < maxIterations; iteration++) {
    applyConduction(system, ke, film, p, q);
    let pq = 0;
    for (let node = 0; node < n; node++)
      if (fixed[node] === 0) pq += (p[node] as number) * (q[node] as number);
    if (!(pq > 0)) break;
    const alpha = rz / pq;
    let rr = 0;
    for (let node = 0; node < n; node++) {
      if (fixed[node] === 1) continue;
      t[node] = (t[node] as number) + alpha * (p[node] as number);
      r[node] = (r[node] as number) - alpha * (q[node] as number);
      rr += (r[node] as number) ** 2;
    }
    relative = Math.sqrt(rr) / rhsNorm;
    if (onProgress !== undefined && iteration % 10 === 0) onProgress(iteration, relative);
    if (relative < tolerance) {
      iteration++;
      break;
    }
    let next = 0;
    for (let node = 0; node < n; node++) {
      if (fixed[node] === 1) continue;
      const d = diagonal[node] as number;
      z[node] = d > 0 ? (r[node] as number) / d : 0;
      next += (r[node] as number) * (z[node] as number);
    }
    const beta = next / rz;
    rz = next;
    for (let node = 0; node < n; node++)
      if (fixed[node] === 0) p[node] = (z[node] as number) + beta * (p[node] as number);
  }
  return {
    temperature: t,
    iterations: iteration,
    relativeResidual: relative,
    converged: relative < tolerance,
  };
}

export interface ThermalSummary {
  minTemperature: number;
  maxTemperature: number;
  /** Largest heat flux through the material, W/m². */
  maxFlux: number;
  /** Heat put in by heaters, W. */
  heatIn: number;
}

/**
 * Per-element heat flux magnitude, W/m², from the temperature gradient at the element's centre, and
 * the summary. Only nodes some element uses count towards the temperature range.
 */
export function thermalFields(
  system: GridSystem,
  material: Material,
  temperature: Float64Array,
  conditions: readonly ThermalCondition[],
): { flux: Float32Array; summary: ThermalSummary } {
  const count = system.elements.length;
  const flux = new Float32Array(count);
  const h = system.grid.h;
  let maxFlux = 0;
  let minTemperature = Infinity;
  let maxTemperature = -Infinity;
  for (let e = 0; e < count; e++) {
    let gx = 0,
      gy = 0,
      gz = 0;
    for (let n = 0; n < 8; n++) {
      const node = system.elementNodes[e * 8 + n] as number;
      const value = temperature[node] as number;
      if (value < minTemperature) minTemperature = value;
      if (value > maxTemperature) maxTemperature = value;
      const [a, b, c] = HEX_NODES[n] as readonly [number, number, number];
      // dN/dx at the centre of a cube of edge h: ±1/(4h).
      gx += ((2 * a - 1) * value) / (4 * h);
      gy += ((2 * b - 1) * value) / (4 * h);
      gz += ((2 * c - 1) * value) / (4 * h);
    }
    // k in W/(m·K) times K/mm: ×1000 for K/m.
    const magnitude = material.conductivity * Math.hypot(gx, gy, gz) * 1000;
    flux[e] = magnitude;
    if (magnitude > maxFlux) maxFlux = magnitude;
  }
  const heatIn = conditions.reduce((sum, c) => (c.kind === 'heat' ? sum + c.power : sum), 0);
  return {
    flux,
    summary: {
      minTemperature: Number.isFinite(minTemperature) ? minTemperature : 0,
      maxTemperature: Number.isFinite(maxTemperature) ? maxTemperature : 0,
      maxFlux,
      heatIn,
    },
  };
}
