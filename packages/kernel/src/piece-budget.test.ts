/** How long a heavy piece may stay silent, from its edges, against the real kernel. */
import { describe, expect, it } from 'vitest';
import { boundsOf, pieceBudgetMs, solidLeaves } from './tessellation.js';
import { loadOcct } from './wasm.js';

describe('the silence a piece of work is allowed', { timeout: 30_000 }, () => {
  it('is the ordinary deadline for a plain part, and more for one with many edges', async () => {
    const occt = await loadOcct();
    const box = occt.makeBox(10, 10, 10);
    // Twelve edges: not worth saying anything about.
    expect(pieceBudgetMs(occt, box)).toBeLessThan(31_000);
    // A plate with forty holes: 120 more edges, and a deadline to match.
    let plate = occt.makeBox(100, 100, 5);
    for (let i = 0; i < 40; i++) {
      const hole = occt.makeCylinder(1, 10);
      const moved = occt.translate(hole, 5 + (i % 10) * 9, 5 + Math.floor(i / 10) * 9, -2);
      plate = occt.cut(plate, moved);
    }
    expect(pieceBudgetMs(occt, plate)).toBeGreaterThan(pieceBudgetMs(occt, box) + 4_000);
  });

  it('gives the same box for a plain part whichever way it is worked out', async () => {
    const occt = await loadOcct();
    const box = occt.makeBox(10, 20, 30);
    const found = boundsOf(occt, box);
    expect(found.max.x - found.min.x).toBeCloseTo(10, 4);
    expect(found.max.z - found.min.z).toBeCloseTo(30, 4);
  });
});

describe('an assembly with loose surfaces beside its solids', () => {
  it('is taken part by part, the surfaces too, and not whole', async () => {
    const occt = await loadOcct();
    const solid = occt.makeBox(10, 10, 10);
    const other = occt.translate(occt.makeBox(5, 5, 5), 30, 0, 0);
    // A face on its own, as a STEP file holds a surface body: not a solid, not in one.
    const [face] = occt.getSubShapes(occt.translate(occt.makeBox(8, 8, 8), 0, 30, 0), 'face');
    if (face === undefined) throw new Error('no face');
    const shell = occt.makeCompound([solid, other, face]);
    const parts = solidLeaves(occt, shell);
    expect(parts).not.toBeNull();
    expect(parts).toHaveLength(3);
    // Boxed as parts, and the box is the one round everything.
    const box = boundsOf(occt, shell);
    expect(box.max.x).toBeCloseTo(35, 4);
    expect(box.max.y).toBeCloseTo(38, 4);
  });
});
