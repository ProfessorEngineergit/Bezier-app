import { describe, expect, it } from 'vitest';
import { extendRun, indexEnds } from './seam-chain.js';
import type { SeamTable } from './seams.js';

/** Seams as (ends, the two faces either side). */
function table(seams: readonly (readonly [number[], number, number])[]): SeamTable {
  return {
    count: seams.length,
    ends: Float32Array.from(seams.flatMap(([ends]) => ends)),
    first: Int32Array.from(seams.map(([, a]) => a)),
    second: Int32Array.from(seams.map(([, , b]) => b)),
    more: new Map(),
  };
}

describe('the run an edge belongs to', () => {
  const rounded = table([
    [[0, 0, 0, 1, 0, 0], 0, 1], // the straight side being pointed at
    [[1, 0, 0, 2, 0, 0], 0, 1], // and the rest of that edge
    [[2, 0, 0, 2.5, 0.2, 0], 0, 2], // round the corner, on the same plate: carries on
    [[2.5, 0.2, 0, 2.5, 1.2, 0], 0, 3], // a sharp turn: stops here
    [[2, 0, 0, 2, 0, 1], 5, 6], // meets the run but belongs to other faces
  ]);

  it('follows an edge round a smooth corner and stops at a sharp one', () => {
    const run = extendRun(rounded, indexEnds(rounded), [0, 1]);
    expect(run.sort()).toEqual([0, 1, 2]);
  });

  it('is the same from either end of the run', () => {
    const run = extendRun(rounded, indexEnds(rounded), [2]);
    expect(run.sort()).toEqual([0, 1, 2]);
  });

  it('closes a ring that was cut in two', () => {
    const ring = table(
      Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * 2 * Math.PI;
        const b = ((i + 1) / 24) * 2 * Math.PI;
        return [
          [Math.cos(a), Math.sin(a), 0, Math.cos(b), Math.sin(b), 0],
          0,
          i < 12 ? 1 : 2,
        ] as const;
      }),
    );
    const run = extendRun(ring, indexEnds(ring), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(run.length).toBe(24);
  });
});

describe('the weld of a mesh far from the origin', () => {
  it('is wider where 32-bit numbers are coarser, so the two sides of a seam still meet', async () => {
    const { Welder, WELD, weldFor } = await import('./seams.js');
    expect(weldFor([10, 20, 30])).toBe(WELD);
    const far = weldFor([20000, 0, 0]);
    expect(far).toBeGreaterThan(1e-2);
    const welder = new Welder(16, far);
    // The same point as two faces measured it, a few units of the last place apart.
    expect(welder.id(20000, 5, 0)).toBe(welder.id(20000.004, 5.003, 0));
    // And with the plain weld they would not have been one point.
    const plain = new Welder(16);
    expect(plain.id(20000, 5, 0)).not.toBe(plain.id(20000.004, 5, 0));
  });
});
