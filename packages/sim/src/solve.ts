/**
 * Matrix-free small-strain linear elasticity on the voxel grid. All elements share one 24×24
 * matrix, so the global matrix is never stored. A per-element scale lets SIMP reuse the solve.
 */

import { HEX_NODES, hex8Stiffness } from './hex8.js';
import type { Material, Study } from './model.js';
import type { VoxelGrid } from './voxel.js';

export interface GridSystem {
  grid: VoxelGrid;
  /** Voxel index of each solid element, in element order. */
  elements: Uint32Array;
  /** Eight node ids per element, `HEX_NODES` order. */
  elementNodes: Int32Array;
  nodeCount: number;
  /** 1 for every dof that belongs to at least one solid element. */
  activeDof: Uint8Array;
}

export function gridSystem(grid: VoxelGrid): GridSystem {
  const { nx, ny, nz, solid, solidCount } = grid;
  const px = nx + 1,
    py = ny + 1;
  const elements = new Uint32Array(solidCount);
  const elementNodes = new Int32Array(solidCount * 8);
  const nodeCount = px * py * (nz + 1);
  const activeDof = new Uint8Array(nodeCount * 3);
  let e = 0;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const voxel = i + nx * (j + ny * k);
        if (solid[voxel] === 0) continue;
        elements[e] = voxel;
        for (let n = 0; n < 8; n++) {
          const [a, b, c] = HEX_NODES[n] as readonly [number, number, number];
          const node = i + a + px * (j + b + py * (k + c));
          elementNodes[e * 8 + n] = node;
          activeDof[node * 3] = 1;
          activeDof[node * 3 + 1] = 1;
          activeDof[node * 3 + 2] = 1;
        }
        e++;
      }
  return { grid, elements, elementNodes, nodeCount, activeDof };
}

/** Local nodes lying on voxel side `side` (−x, +x, −y, +y, −z, +z). */
export function sideNodes(side: number): number[] {
  const axis = side >> 1,
    at = side & 1;
  return HEX_NODES.flatMap((local, n) => (local[axis] === at ? [n] : []));
}

/** Outward unit normal of a voxel side. */
export function sideNormal(side: number): [number, number, number] {
  const normal: [number, number, number] = [0, 0, 0];
  normal[side >> 1] = side & 1 ? 1 : -1;
  return normal;
}

export interface Placement {
  /** 1 where the dof is held at zero. Includes dofs no element touches. */
  fixed: Uint8Array;
  force: Float64Array;
  /** Faces that carry a load or a constraint, never removed by optimisation. */
  keptFaces: Set<number>;
  /** Plain-language problems that stop or weaken the study. */
  issues: string[];
}

/**
 * Converts constraints and loads into a fixed-dof mask and a force vector. `faceIndex` maps a
 * stable-reference string to the display face index used to tag the voxel boundary.
 */
export function place(
  system: GridSystem,
  study: Pick<Study, 'constraints' | 'loads'>,
  material: Material,
  faceIndex: ReadonlyMap<string, number>,
): Placement {
  const { grid, elementNodes, activeDof } = system;
  const dofs = system.nodeCount * 3;
  const fixed = new Uint8Array(dofs);
  for (let d = 0; d < dofs; d++) if (activeDof[d] === 0) fixed[d] = 1;
  const force = new Float64Array(dofs);
  const keptFaces = new Set<number>();
  const issues: string[] = [];

  const elementOfVoxel = new Int32Array(grid.nx * grid.ny * grid.nz).fill(-1);
  system.elements.forEach((voxel, e) => {
    elementOfVoxel[voxel] = e;
  });

  /** Every exposed side lying on any of these faces, as [element, side] pairs. */
  const sidesOn = (keys: readonly string[], what: string): [number, number][] => {
    const wanted = new Set<number>();
    for (const key of keys) {
      const index = faceIndex.get(key);
      if (index === undefined) issues.push(`A face used by ${what} is no longer on the part.`);
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

  for (const constraint of study.constraints) {
    const sides = sidesOn(constraint.faces, 'a constraint');
    for (const [element, side] of sides) {
      for (const local of sideNodes(side)) {
        const node = elementNodes[element * 8 + local] as number;
        for (let axis = 0; axis < 3; axis++) {
          const held =
            constraint.kind === 'fixed' ||
            (constraint.kind === 'pin' && constraint.axes[axis] === true) ||
            (constraint.kind === 'frictionless' && axis === side >> 1);
          if (held) fixed[node * 3 + axis] = 1;
        }
      }
    }
  }

  const h = grid.h;
  for (const load of study.loads) {
    if (load.kind === 'gravity') {
      const perNode = (material.density * load.acceleration * h * h * h) / 8;
      for (let e = 0; e < system.elements.length; e++)
        for (let n = 0; n < 8; n++) {
          const node = elementNodes[e * 8 + n] as number;
          for (let axis = 0; axis < 3; axis++)
            force[node * 3 + axis] =
              (force[node * 3 + axis] as number) + perNode * (load.direction[axis] as number);
        }
      continue;
    }
    const sides = sidesOn(load.faces, 'a load');
    if (sides.length === 0) continue;
    for (const [element, side] of sides) {
      let vector: [number, number, number];
      if (load.kind === 'force') {
        // Shared by count, not staircase area, so the resultant equals the input force exactly.
        const share = load.magnitude / sides.length;
        vector = [load.direction[0] * share, load.direction[1] * share, load.direction[2] * share];
      } else {
        // Against the outward normal. Summed over the staircase, the axis-aligned sides give the
        // true area vector.
        const normal = sideNormal(side);
        const amount = -load.pressure * h * h;
        vector = [normal[0] * amount, normal[1] * amount, normal[2] * amount];
      }
      for (const local of sideNodes(side)) {
        const node = elementNodes[element * 8 + local] as number;
        for (let axis = 0; axis < 3; axis++)
          force[node * 3 + axis] =
            (force[node * 3 + axis] as number) + (vector[axis] as number) / 4;
      }
    }
  }

  if (study.constraints.length === 0) {
    issues.push(
      'Add a constraint. Without one the part is free to move and has no stress to report.',
    );
  }
  if (study.loads.length === 0)
    issues.push('Add a load. With nothing pushing on it, the part is unstressed.');
  return { fixed, force, keptFaces, issues };
}

export interface SolveOptions {
  /** Relative residual ‖r‖/‖f‖ to stop at. */
  tolerance?: number;
  maxIterations?: number;
  /** Per-element stiffness multiplier (SIMP). Omitted is 1 everywhere. */
  scale?: Float64Array;
  /** Previous displacement to start from; makes a re-solve much faster. */
  initial?: Float64Array;
  onProgress?: (iteration: number, relativeResidual: number) => void;
}

export interface SolveResult {
  displacement: Float64Array;
  iterations: number;
  relativeResidual: number;
  converged: boolean;
}

/** y = K·x over the solid elements, honouring the per-element scale. */
export function applyStiffness(
  system: GridSystem,
  ke: Float64Array,
  x: Float64Array,
  y: Float64Array,
  scale?: Float64Array,
): void {
  y.fill(0);
  const { elementNodes } = system;
  const ue = new Float64Array(24);
  const dof = new Int32Array(24);
  const count = system.elements.length;
  for (let e = 0; e < count; e++) {
    for (let n = 0; n < 8; n++) {
      const node = (elementNodes[e * 8 + n] as number) * 3;
      dof[n * 3] = node;
      dof[n * 3 + 1] = node + 1;
      dof[n * 3 + 2] = node + 2;
      ue[n * 3] = x[node] as number;
      ue[n * 3 + 1] = x[node + 1] as number;
      ue[n * 3 + 2] = x[node + 2] as number;
    }
    const s = scale === undefined ? 1 : (scale[e] as number);
    for (let r = 0; r < 24; r++) {
      let sum = 0;
      const row = r * 24;
      for (let c = 0; c < 24; c++) sum += (ke[row + c] as number) * (ue[c] as number);
      const target = dof[r] as number;
      y[target] = (y[target] as number) + s * sum;
    }
  }
}

/** Jacobi-preconditioned conjugate gradient on the free dofs. */
export function solveStatic(
  system: GridSystem,
  material: Material,
  placement: Pick<Placement, 'fixed' | 'force'>,
  options: SolveOptions = {},
): SolveResult {
  const { fixed, force } = placement;
  const n = force.length;
  const ke = hex8Stiffness(material.youngsModulus, material.poissonRatio, system.grid.h);
  const { tolerance = 1e-6, maxIterations = 4000, scale, onProgress } = options;

  const diagonal = new Float64Array(n);
  const { elementNodes } = system;
  for (let e = 0; e < system.elements.length; e++) {
    const s = scale === undefined ? 1 : (scale[e] as number);
    for (let r = 0; r < 24; r++) {
      const node = elementNodes[e * 8 + ((r / 3) | 0)] as number;
      const d = node * 3 + (r % 3);
      diagonal[d] = (diagonal[d] as number) + s * (ke[r * 24 + r] as number);
    }
  }

  const x =
    options.initial === undefined ? new Float64Array(n) : Float64Array.from(options.initial);
  for (let d = 0; d < n; d++) if (fixed[d] === 1) x[d] = 0;
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const q = new Float64Array(n);

  applyStiffness(system, ke, x, q, scale);
  let forceNorm = 0;
  for (let d = 0; d < n; d++) {
    if (fixed[d] === 1) continue;
    r[d] = (force[d] as number) - (q[d] as number);
    forceNorm += (force[d] as number) ** 2;
  }
  forceNorm = Math.sqrt(forceNorm);
  if (forceNorm === 0)
    return { displacement: x, iterations: 0, relativeResidual: 0, converged: true };

  let rz = 0;
  for (let d = 0; d < n; d++) {
    if (fixed[d] === 1) continue;
    const dg = diagonal[d] as number;
    z[d] = dg > 0 ? (r[d] as number) / dg : 0;
    p[d] = z[d] as number;
    rz += (r[d] as number) * (z[d] as number);
  }

  let iteration = 0;
  let relative = 1;
  for (; iteration < maxIterations; iteration++) {
    applyStiffness(system, ke, p, q, scale);
    let pq = 0;
    for (let d = 0; d < n; d++) if (fixed[d] === 0) pq += (p[d] as number) * (q[d] as number);
    // Non-positive curvature: some part is not held. Stop instead of diverging.
    if (!(pq > 0)) break;
    const alpha = rz / pq;
    let rr = 0;
    for (let d = 0; d < n; d++) {
      if (fixed[d] === 1) continue;
      x[d] = (x[d] as number) + alpha * (p[d] as number);
      r[d] = (r[d] as number) - alpha * (q[d] as number);
      rr += (r[d] as number) ** 2;
    }
    relative = Math.sqrt(rr) / forceNorm;
    if (onProgress !== undefined && iteration % 10 === 0) onProgress(iteration, relative);
    if (relative < tolerance) {
      iteration++;
      break;
    }
    let rzNext = 0;
    for (let d = 0; d < n; d++) {
      if (fixed[d] === 1) continue;
      const dg = diagonal[d] as number;
      z[d] = dg > 0 ? (r[d] as number) / dg : 0;
      rzNext += (r[d] as number) * (z[d] as number);
    }
    const beta = rzNext / rz;
    rz = rzNext;
    for (let d = 0; d < n; d++)
      if (fixed[d] === 0) p[d] = (z[d] as number) + beta * (p[d] as number);
  }
  return {
    displacement: x,
    iterations: iteration,
    relativeResidual: relative,
    converged: relative < tolerance,
  };
}
