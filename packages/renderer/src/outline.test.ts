/**
 * Seam endpoint matching. Both sides of a seam are tessellated separately and agree only to float
 * noise; a single quantisation grid loses pairs that straddle a cell boundary (common on fillets).
 */

import { describe, expect, it } from 'vitest';
import { cornersFrom } from './outline.js';
import { buildSeams, facesOf, Welder } from './seams.js';

describe('welding positions', () => {
  it('gives one number to one place', () => {
    const ids = new Welder();
    expect(ids.id(1, 2, 3)).toBe(ids.id(1, 2, 3));
  });

  it('separates places that are genuinely apart', () => {
    const ids = new Welder();
    expect(ids.id(0, 0, 0)).not.toBe(ids.id(1, 0, 0));
    expect(ids.id(0, 0, 0)).not.toBe(ids.id(0, 0, 0.01));
  });

  it('matches a pair that straddles a cell boundary, which one grid loses', () => {
    // 5e-5 is half a cell: the two sit either side of a boundary on the plain grid and round apart.
    const ids = new Welder();
    const below = ids.id(5e-5 - 1e-9, 0, 0);
    const above = ids.id(5e-5 + 1e-9, 0, 0);
    expect(below).toBe(above);
  });

  it('matches a pair that straddles boundaries in two axes at once, which two grids lose', () => {
    // Apart in x on one grid and in y on a grid shifted half a cell, they agreed on neither.
    const ids = new Welder();
    const one = ids.id(5e-5 - 1e-9, 5e-5 - 1e-9, 0);
    const other = ids.id(5e-5 + 1e-9, 5e-5 + 1e-9, 0);
    const third = ids.id(5e-5 + 1e-9, 5e-5 - 1e-9, 5e-5 + 1e-9);
    expect(other).toBe(one);
    expect(third).toBe(one);
  });

  it('matches wherever the boundary falls, not just at one offset', () => {
    // Sweeping the pair across a whole cell: on a curve every vertex sits at a different fraction
    // of one, so a fix that only works at one offset would still leave a scattering of gaps.
    for (let step = 0; step <= 40; step++) {
      const ids = new Welder();
      const at = (step / 40) * 1e-4;
      expect(ids.id(at - 1e-9, 0.5, -2)).toBe(ids.id(at + 1e-9, 0.5, -2));
    }
  });

  it('hands out numbers in the order places are first seen', () => {
    const ids = new Welder();
    expect(ids.id(0, 0, 0)).toBe(0);
    expect(ids.id(5, 0, 0)).toBe(1);
    expect(ids.id(0, 0, 0)).toBe(0);
  });
});

describe('the seams of a mesh', () => {
  /**
   * Two faces of a box meeting along x = 0..10 at y = 0, z = 0: the floor (face 0) and the front
   * (face 1), each two triangles. The floor shares its vertices between its triangles, as OCCT does
   * inside a face, and the front has its own copies of the shared corners, as OCCT does along a
   * border.
   */
  const mesh = {
    positions: new Float32Array([
      // floor: 0..3
      0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0,
      // front: 4..7, its bottom corners repeating the floor's
      0, 0, 0, 10, 0, 0, 10, 0, 10, 0, 0, 10,
    ]),
    normals: new Float32Array(24),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
    triangleFaces: new Uint32Array([0, 0, 1, 1]),
  };

  it('keeps the edges between faces and drops the ones inside a face', () => {
    const table = buildSeams(mesh);
    const shared = [];
    for (let seam = 0; seam < table.count; seam++) {
      if (facesOf(table, seam).size === 2) shared.push(seam);
    }
    // One seam between the two faces: the bottom edge of the front.
    expect(shared).toHaveLength(1);
    // The diagonals inside each face are not seams at all; the six other border edges have one face
    // each.
    expect(table.count).toBe(7);
  });

  it('matches the two sides of a seam a rounding error apart', () => {
    const nudged = { ...mesh, positions: mesh.positions.slice() };
    // The shared corner, either side of a cell boundary on the plain grid.
    nudged.positions[0] = 5e-5 + 1e-9; // the floor's copy, x
    nudged.positions[12] = 5e-5 - 1e-9; // the front's copy, x
    const table = buildSeams(nudged);
    let shared = 0;
    for (let seam = 0; seam < table.count; seam++) {
      if (facesOf(table, seam).size === 2) shared++;
    }
    expect(shared).toBe(1);
  });
});

describe('cornersOf', () => {
  /** A seam between two faces, at a stated pair of positions. */
  const seam = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    faces: readonly number[],
  ) => ({ ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], faces: new Set(faces) });

  it('counts a point where three faces meet, and not one where two do', () => {
    // Along a straight edge a tessellation leaves dozens of points touching the same two faces.
    // None is a corner, and offering all as places to measure to would bury the four that are.
    const corners = cornersFrom(
      [
        seam([0, 0, 0], [1, 0, 0], [1, 2]),
        seam([1, 0, 0], [2, 0, 0], [1, 2]),
        seam([2, 0, 0], [2, 1, 0], [1, 3]),
      ],
      [1],
    );
    expect(corners).toEqual([{ x: 2, y: 0, z: 0 }]);
  });

  it('has no corners to offer for no faces', () => {
    expect(cornersFrom([seam([0, 0, 0], [1, 0, 0], [1, 2, 3])], [])).toEqual([]);
  });

  it('ignores meetings that do not involve the face asked about', () => {
    const corners = cornersFrom(
      [seam([0, 0, 0], [1, 0, 0], [4, 5]), seam([1, 0, 0], [1, 1, 0], [4, 6])],
      [1],
    );
    expect(corners).toEqual([]);
  });
});
