import type { Mesh } from '@bezier/kernel';
import { describe, expect, it } from 'vitest';
import { buildSeams } from './seams.js';

/**
 * Two flat faces side by side along x = 10. The left one has that side as one edge; the right one
 * has it in `pieces` edges, as a face meshed again more finely would, bowed out by `bow` at the
 * points between, as two tessellations of a curve differ.
 */
function mismatched(pieces: number, bow = 0): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const triangleFaces: number[] = [];
  const vertex = (x: number, y: number, z = 0) => positions.push(x, y, z) / 3 - 1;

  // Face 0: a square, two triangles, one edge along x = 10.
  const a = vertex(0, 0);
  const b = vertex(10, 0);
  const c = vertex(10, 10);
  const d = vertex(0, 10);
  indices.push(a, b, c, a, c, d);
  triangleFaces.push(0, 0);

  // Face 1: a fan from a far corner to the points along x = 10.
  const far = vertex(20, 5);
  const along: number[] = [];
  for (let i = 0; i <= pieces; i++) {
    const t = i / pieces;
    along.push(vertex(10 + (i === 0 || i === pieces ? 0 : bow), 10 * t));
  }
  for (let i = 0; i < pieces; i++) {
    indices.push(far, along[i] ?? 0, along[i + 1] ?? 0);
    triangleFaces.push(1);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(positions.length),
    indices: new Uint32Array(indices),
    triangleFaces: new Uint32Array(triangleFaces),
  } as unknown as Mesh;
}

const seamsBetween = (mesh: Mesh, a: number, b: number) => {
  const table = buildSeams(mesh);
  let count = 0;
  for (let seam = 0; seam < table.count; seam++) {
    const one = table.first[seam];
    const two = table.second[seam];
    if ((one === a && two === b) || (one === b && two === a)) count++;
  }
  return count;
};

describe('a border two faces divide differently', () => {
  it('is one seam when both sides divide it the same way', () => {
    expect(seamsBetween(mismatched(1), 0, 1)).toBe(1);
  });

  it('is found from both sides when one side has it in more pieces', () => {
    // The whole edge of the square, and each of the four pieces across it.
    expect(seamsBetween(mismatched(4), 0, 1)).toBe(5);
  });

  it('is found when the two tessellations of a curve lie a little apart', () => {
    expect(seamsBetween(mismatched(4, 0.2), 0, 1)).toBe(5);
  });

  it('is not invented between faces whose borders are apart', () => {
    // Bowed out by a millimetre, the right face's border is another line, not the same one.
    expect(seamsBetween(mismatched(4, 1.2), 0, 1)).toBeLessThan(5);
  });

  it('leaves the outer border of a face without a neighbour', () => {
    const table = buildSeams(mismatched(4));
    let alone = 0;
    for (let seam = 0; seam < table.count; seam++) if ((table.second[seam] ?? -1) < 0) alone++;
    // Three sides of the square and two of the fan.
    expect(alone).toBe(5);
  });
});
