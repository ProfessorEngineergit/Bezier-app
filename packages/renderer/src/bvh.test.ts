import { describe, expect, it } from 'vitest';
import { Bvh, createRayHit } from './bvh.js';

/** One triangle in the z = 0 plane, spanning (0,0) to (1,1). */
function triangle(): { positions: Float32Array; indices: Uint32Array } {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

/**
 * An axis-aligned box as 12 triangles, from the origin to (sx, sy, sz). Written out and not
 * generated, so a wrong winding or a missing face is visible in the test and not hidden in a loop.
 */
function box(sx = 10, sy = 10, sz = 10) {
  const positions = new Float32Array([
    0,
    0,
    0,
    sx,
    0,
    0,
    sx,
    sy,
    0,
    0,
    sy,
    0,
    0,
    0,
    sz,
    sx,
    0,
    sz,
    sx,
    sy,
    sz,
    0,
    sy,
    sz,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4,
    7, 0, 7, 3,
  ]);
  return { positions, indices };
}

/** A grid of separate triangles, enough to force the tree past one leaf. */
function grid(count: number) {
  const positions = new Float32Array(count * 9);
  const indices = new Uint32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = i * 2;
    positions.set([x, 0, 0, x + 1, 0, 0, x, 1, 0], i * 9);
    indices.set([i * 3, i * 3 + 1, i * 3 + 2], i * 3);
  }
  return { positions, indices };
}

describe('Bvh', () => {
  it('hits a triangle the ray points at', () => {
    const { positions, indices } = triangle();
    const bvh = new Bvh(positions, indices);
    const hit = createRayHit();

    // Straight down the -z axis at a point comfortably inside the triangle.
    expect(bvh.raycast(0.2, 0.2, 5, 0, 0, -1, hit)).toBe(true);
    expect(hit.triangle).toBe(0);
    expect(hit.distance).toBeCloseTo(5);
    expect(hit.z).toBeCloseTo(0);
  });

  it('misses when the ray points away', () => {
    const { positions, indices } = triangle();
    const bvh = new Bvh(positions, indices);
    const hit = createRayHit();

    expect(bvh.raycast(0.2, 0.2, 5, 0, 0, 1, hit)).toBe(false);
    expect(hit.triangle).toBe(-1);
  });

  it('misses when the ray passes beside the triangle', () => {
    const { positions, indices } = triangle();
    const bvh = new Bvh(positions, indices);
    const hit = createRayHit();

    // Outside the hypotenuse: u + v > 1.
    expect(bvh.raycast(0.9, 0.9, 5, 0, 0, -1, hit)).toBe(false);
  });

  it('reports the nearest of several hits', () => {
    // Three stacked triangles at z = 0, 1, 2. A ray from above must find z = 2.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 2, 1, 0, 2, 0, 1, 2,
    ]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const bvh = new Bvh(positions, indices);
    const hit = createRayHit();

    expect(bvh.raycast(0.2, 0.2, 10, 0, 0, -1, hit)).toBe(true);
    expect(hit.triangle).toBe(2);
    expect(hit.distance).toBeCloseTo(8);
  });

  it('hits the near face of a box, not the far one', () => {
    const { positions, indices } = box(10, 10, 10);
    const bvh = new Bvh(positions, indices);
    const hit = createRayHit();

    expect(bvh.raycast(5, 5, 100, 0, 0, -1, hit)).toBe(true);
    // The top face sits at z = 10, so the ray travels 90.
    expect(hit.distance).toBeCloseTo(90);
    expect(hit.z).toBeCloseTo(10);
  });

  it('finds every triangle when the tree has to branch', () => {
    // 40 triangles against a leaf size of 8, so this exercises real traversal and not a single leaf
    // that holds everything.
    const count = 40;
    const { positions, indices } = grid(count);
    const bvh = new Bvh(positions, indices);
    const hit = createRayHit();

    for (let i = 0; i < count; i++) {
      const found = bvh.raycast(i * 2 + 0.2, 0.2, 5, 0, 0, -1, hit);
      expect(found).toBe(true);
      expect(hit.triangle).toBe(i);
    }
  });

  it('survives triangles that share a centroid', () => {
    // The degenerate case for a spatial-median split: every centroid identical, so the split must
    // fall back to dividing by count or the build never ends.
    const count = 30;
    const positions = new Float32Array(count * 9);
    const indices = new Uint32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], i * 9);
      indices.set([i * 3, i * 3 + 1, i * 3 + 2], i * 3);
    }

    const bvh = new Bvh(positions, indices);
    const hit = createRayHit();
    expect(bvh.raycast(0.2, 0.2, 5, 0, 0, -1, hit)).toBe(true);
  });

  it('handles an empty mesh without crashing', () => {
    const bvh = new Bvh(new Float32Array(0), new Uint32Array(0));
    const hit = createRayHit();

    expect(bvh.triangleCount).toBe(0);
    expect(bvh.raycast(0, 0, 1, 0, 0, -1, hit)).toBe(false);
  });

  it('reports the bounds of the whole mesh', () => {
    const { positions, indices } = box(4, 6, 8);
    const bvh = new Bvh(positions, indices);

    const bounds = new Float32Array(6);
    bvh.bounds(bounds);
    expect([...bounds]).toEqual([0, 0, 0, 4, 6, 8]);
  });

  it('allocates nothing per raycast', () => {
    // The hover budget in ADR 0007 is 8 ms and hovering happens on every mouse move, so the hit
    // object is reused and not returned. This asserts what makes that safe: the same object comes
    // back mutated.
    const { positions, indices } = box();
    const bvh = new Bvh(positions, indices);
    const hit = createRayHit();

    bvh.raycast(5, 5, 100, 0, 0, -1, hit);
    const first = hit.distance;
    bvh.raycast(5, 5, 50, 0, 0, -1, hit);

    expect(hit.distance).toBeCloseTo(first - 50);
  });
});
