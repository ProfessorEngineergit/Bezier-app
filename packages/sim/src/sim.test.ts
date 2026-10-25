/**
 * The solver against hand-worked answers. Uniform tension is exact for trilinear hexahedra;
 * the cantilever is held to a band below Euler–Bernoulli because linear hexes are stiff in
 * bending.
 */

import { describe, expect, it } from 'vitest';
import { hex8Stiffness } from './hex8.js';
import type { Material, Study } from './model.js';
import { sampleField, staticFields } from './results.js';
import { optimise } from './simp.js';
import { gridSystem, place, solveStatic } from './solve.js';
import { type VoxelGrid, voxelise } from './voxel.js';

const STEEL: Material = {
  id: 'test-steel',
  name: 'Steel',
  youngsModulus: 200_000,
  poissonRatio: 0.3,
  density: 7.85e-9,
  yieldStrength: 250,
  conductivity: 50,
  family: 'metal',
};

/** A fully solid box whose exterior sides are tagged face = side (−x=0 … +z=5). */
function boxGrid(nx: number, ny: number, nz: number, h: number): VoxelGrid {
  const solid = new Uint8Array(nx * ny * nz).fill(1);
  const voxel: number[] = [],
    side: number[] = [],
    face: number[] = [];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const e = i + nx * (j + ny * k);
        const exposed = [i === 0, i === nx - 1, j === 0, j === ny - 1, k === 0, k === nz - 1];
        exposed.forEach((isOut, s) => {
          if (!isOut) return;
          voxel.push(e);
          side.push(s);
          face.push(s);
        });
      }
  return {
    nx,
    ny,
    nz,
    h,
    origin: [0, 0, 0],
    solid,
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

describe('hex8', () => {
  it('is symmetric and has the six rigid-body motions in its null space', () => {
    const k = hex8Stiffness(1000, 0.3, 2);
    for (let r = 0; r < 24; r++)
      for (let c = 0; c < 24; c++) expect(k[r * 24 + c]).toBeCloseTo(k[c * 24 + r] as number, 8);
    // Translation along x: every node moves by 1 in x.
    const u = new Float64Array(24);
    for (let n = 0; n < 8; n++) u[n * 3] = 1;
    for (let r = 0; r < 24; r++) {
      let sum = 0;
      for (let c = 0; c < 24; c++) sum += (k[r * 24 + c] as number) * (u[c] as number);
      expect(Math.abs(sum)).toBeLessThan(1e-8);
    }
  });
});

describe('static stress', () => {
  it('reproduces a bar in uniform tension exactly: σ = F/A, δ = FL/EA', () => {
    const grid = boxGrid(10, 2, 2, 1);
    const system = gridSystem(grid);
    const force = 800; // N over A = 4 mm² → 200 MPa
    const study: Pick<Study, 'constraints' | 'loads'> = {
      // Rollers on three orthogonal faces: uniaxial tension with free lateral contraction.
      constraints: [
        { id: 'c1', kind: 'frictionless', faces: ['minX'] },
        { id: 'c2', kind: 'frictionless', faces: ['minY'] },
        { id: 'c3', kind: 'frictionless', faces: ['minZ'] },
      ],
      loads: [{ id: 'l1', kind: 'force', faces: ['maxX'], magnitude: force, direction: [1, 0, 0] }],
    };
    const placement = place(system, study, STEEL, FACES);
    expect(placement.issues).toEqual([]);
    const solved = solveStatic(system, STEEL, placement, { tolerance: 1e-10 });
    expect(solved.converged).toBe(true);

    const fields = staticFields(system, STEEL, solved.displacement, placement.force);
    expect(fields.summary.maxVonMises).toBeCloseTo(200, 4);
    expect(Math.min(...fields.vonMises)).toBeCloseTo(200, 4);
    expect(fields.summary.appliedForce[0]).toBeCloseTo(force, 8);

    // δ = FL/EA = 800·10 / (200 000·4) = 0.01 mm at the loaded end, linear in x.
    const ux = new Float32Array(system.nodeCount);
    for (let n = 0; n < system.nodeCount; n++) ux[n] = solved.displacement[n * 3] as number;
    const samples = sampleField(system, ux, [10, 1, 1, 5, 0.3, 1.7, 2.5, 1.1, 0.4], 1);
    expect(samples[0]).toBeCloseTo(0.01, 7);
    expect(samples[1]).toBeCloseTo(0.005, 7);
    expect(samples[2]).toBeCloseTo(0.0025, 7);
  });

  it('bends a cantilever within the band linear hexahedra are known for', () => {
    const [length, width, height, h] = [20, 2, 2, 0.5];
    const system = gridSystem(boxGrid(length / h, width / h, height / h, h));
    const force = 10;
    const placement = place(
      system,
      {
        constraints: [{ id: 'c', kind: 'fixed', faces: ['minX'] }],
        loads: [
          { id: 'l', kind: 'force', faces: ['maxX'], magnitude: force, direction: [0, 0, -1] },
        ],
      },
      STEEL,
      FACES,
    );
    const solved = solveStatic(system, STEEL, placement, { tolerance: 1e-8 });
    expect(solved.converged).toBe(true);
    const inertia = (width * height ** 3) / 12;
    const beam = (force * length ** 3) / (3 * STEEL.youngsModulus * inertia);
    const uz = new Float32Array(system.nodeCount);
    for (let n = 0; n < system.nodeCount; n++) uz[n] = solved.displacement[n * 3 + 2] as number;
    const tip = -(sampleField(system, uz, [length, width / 2, height / 2], 1)[0] as number);
    // Fully integrated hex8 locks in shear, so it lands a little under the beam formula and
    // gets closer with refinement.
    expect(tip / beam).toBeGreaterThan(0.7);
    expect(tip / beam).toBeLessThan(1.05);
  });

  it('refuses to report stress for a part that is not held', () => {
    const system = gridSystem(boxGrid(4, 2, 2, 1));
    const placement = place(
      system,
      {
        constraints: [],
        loads: [{ id: 'l', kind: 'force', faces: ['maxX'], magnitude: 1, direction: [1, 0, 0] }],
      },
      STEEL,
      FACES,
    );
    expect(placement.issues.some((issue) => issue.includes('constraint'))).toBe(true);
  });
});

describe('voxelise', () => {
  it('fills a closed box and tags each side with the face it lies on', () => {
    // A 10×4×2 box as 12 triangles; face id per side, −x=0 … +z=5.
    const p = [0, 0, 0, 10, 0, 0, 10, 4, 0, 0, 4, 0, 0, 0, 2, 10, 0, 2, 10, 4, 2, 0, 4, 2];
    const quads: [number, number, number, number, number][] = [
      [0, 3, 7, 4, 0],
      [1, 5, 6, 2, 1],
      [0, 4, 5, 1, 2],
      [3, 2, 6, 7, 3],
      [0, 1, 2, 3, 4],
      [4, 7, 6, 5, 5],
    ];
    const indices: number[] = [];
    const faces: number[] = [];
    for (const [a, b, c, d, face] of quads) {
      indices.push(a, b, c, a, c, d);
      faces.push(face, face);
    }
    const grid = voxelise(
      {
        positions: Float32Array.from(p),
        indices: Uint32Array.from(indices),
        triangleFaces: Uint32Array.from(faces),
      },
      640,
    );
    expect(grid.solidCount * grid.h ** 3).toBeGreaterThan(80 * 0.8);
    expect(grid.solidCount * grid.h ** 3).toBeLessThan(80 * 1.25);
    // Every exposed side must carry the face whose normal it shares.
    for (let b = 0; b < grid.boundary.count; b++) {
      expect(grid.boundary.face[b]).toBe(grid.boundary.side[b]);
    }
  });
});

describe('shape optimisation', () => {
  it('holds the volume target and makes the part stiffer per unit of material', () => {
    const system = gridSystem(boxGrid(16, 2, 8, 1));
    const placement = place(
      system,
      {
        constraints: [{ id: 'c', kind: 'fixed', faces: ['minX'] }],
        loads: [{ id: 'l', kind: 'force', faces: ['maxX'], magnitude: 1, direction: [0, 0, -1] }],
      },
      STEEL,
      FACES,
    );
    const result = optimise(system, STEEL, placement, {
      volumeFraction: 0.4,
      penalty: 3,
      filterRadius: 1.5,
      iterations: 20,
    });
    const last = result.history.at(-1);
    const first = result.history[0];
    expect(last).toBeDefined();
    expect(Math.abs((last?.volumeFraction ?? 0) - 0.4)).toBeLessThan(0.05);
    expect(last?.compliance ?? Infinity).toBeLessThan(first?.compliance ?? 0);
  });
});
