/**
 * Steady conduction against hand-worked answers. Trilinear hexahedra reproduce a linear
 * temperature exactly, so these must match the textbook line to solver precision.
 */

import { describe, expect, it } from 'vitest';
import type { Material } from './model.js';
import { gridSystem } from './solve.js';
import { hex8Conduction, placeThermal, solveThermal, thermalFields } from './thermal.js';
import type { VoxelGrid } from './voxel.js';

const ALUMINIUM: Material = {
  id: 'test-al',
  name: 'Aluminium',
  youngsModulus: 69_000,
  poissonRatio: 0.33,
  density: 2.7e-9,
  yieldStrength: 276,
  conductivity: 167,
  family: 'metal',
};

/** A fully solid box whose exterior sides are tagged face = side (−x=0 … +z=5), as in sim.test.ts. */
function boxGrid(nx: number, ny: number, nz: number, h: number): VoxelGrid {
  const voxel: number[] = [],
    side: number[] = [],
    face: number[] = [];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const e = i + nx * (j + ny * k);
        [i === 0, i === nx - 1, j === 0, j === ny - 1, k === 0, k === nz - 1].forEach(
          (isOut, s) => {
            if (!isOut) return;
            voxel.push(e);
            side.push(s);
            face.push(s);
          },
        );
      }
  return {
    nx,
    ny,
    nz,
    h,
    origin: [0, 0, 0],
    solid: new Uint8Array(nx * ny * nz).fill(1),
    solidCount: nx * ny * nz,
    boundary: {
      voxel: Uint32Array.from(voxel),
      side: Uint8Array.from(side),
      face: Int32Array.from(face),
      count: voxel.length,
    },
  };
}

const FACES = new Map([
  ['minX', 0],
  ['maxX', 1],
  ['minY', 2],
  ['maxY', 3],
  ['minZ', 4],
  ['maxZ', 5],
]);

/** Temperature of the node at grid position (i, j, k). */
function at(grid: VoxelGrid, temperature: Float64Array, i: number, j: number, k: number) {
  return temperature[i + (grid.nx + 1) * (j + (grid.ny + 1) * k)] as number;
}

describe('hex8 conduction', () => {
  it('is symmetric and passes a uniform temperature without any heat', () => {
    const k = hex8Conduction();
    for (let r = 0; r < 8; r++) {
      let sum = 0;
      for (let c = 0; c < 8; c++) {
        expect(k[r * 8 + c]).toBeCloseTo(k[c * 8 + r] as number, 12);
        sum += k[r * 8 + c] as number;
      }
      expect(Math.abs(sum)).toBeLessThan(1e-12);
    }
  });
});

describe('steady conduction', () => {
  it('runs linearly between two held temperatures', () => {
    const grid = boxGrid(10, 2, 2, 2);
    const system = gridSystem(grid);
    const conditions = [
      { id: 'hot', kind: 'temperature' as const, faces: ['minX'], temperature: 100 },
      { id: 'cold', kind: 'temperature' as const, faces: ['maxX'], temperature: 20 },
    ];
    const placement = placeThermal(system, conditions, FACES);
    expect(placement.issues).toEqual([]);
    const solved = solveThermal(system, ALUMINIUM, placement);
    expect(solved.converged).toBe(true);
    for (let i = 0; i <= 10; i++)
      expect(at(grid, solved.temperature, i, 1, 1)).toBeCloseTo(100 - 8 * i, 6);
    // q = k ΔT / L: 167 W/(m·K) × 80 K / 0.02 m.
    const { summary } = thermalFields(system, ALUMINIUM, solved.temperature, conditions);
    expect(summary.maxFlux).toBeCloseTo((167 * 80) / 0.02, 0);
    expect(summary.minTemperature).toBeCloseTo(20, 6);
    expect(summary.maxTemperature).toBeCloseTo(100, 6);
  });

  it('rises by P·L / (k·A) from a held end to a heated one', () => {
    // 40 × 4 × 4 mm: A = 16 mm², L = 40 mm, 2 W in.
    const grid = boxGrid(20, 2, 2, 2);
    const system = gridSystem(grid);
    const placement = placeThermal(
      system,
      [
        { id: 'sink', kind: 'temperature', faces: ['minX'], temperature: 25 },
        { id: 'heater', kind: 'heat', faces: ['maxX'], power: 2 },
      ],
      FACES,
    );
    const solved = solveThermal(system, ALUMINIUM, placement);
    const rise = (2 * 0.04) / (167 * 16e-6);
    expect(at(grid, solved.temperature, 20, 1, 1)).toBeCloseTo(25 + rise, 4);
  });

  it('settles a heated part with a film where heat in equals heat out', () => {
    const grid = boxGrid(6, 6, 6, 2);
    const system = gridSystem(grid);
    const conditions = [
      { id: 'heater', kind: 'heat' as const, faces: ['minZ'], power: 1 },
      { id: 'air', kind: 'convection' as const, faces: ['maxZ'], coefficient: 10, ambient: 20 },
    ];
    const placement = placeThermal(system, conditions, FACES);
    const solved = solveThermal(system, ALUMINIUM, placement);
    // What the air takes from the top face: Σ film·(T − T∞) over its nodes, W.
    let out = 0;
    for (let node = 0; node < system.nodeCount; node++)
      out += (placement.film[node] as number) * ((solved.temperature[node] as number) - 20);
    expect(out).toBeCloseTo(1, 5);
    // 1 W through 144 mm² at 10 W/(m²·K) is about 694 K above the air.
    expect(at(grid, solved.temperature, 3, 3, 6)).toBeCloseTo(20 + 1 / (10 * 144e-6), 0);
  });

  it('says what is missing when the heat has nowhere to go', () => {
    const system = gridSystem(boxGrid(2, 2, 2, 1));
    const placement = placeThermal(
      system,
      [{ id: 'h', kind: 'heat', faces: ['minX'], power: 1 }],
      FACES,
    );
    expect(placement.issues.some((issue) => issue.startsWith('Add a Temperature'))).toBe(true);
  });
});
