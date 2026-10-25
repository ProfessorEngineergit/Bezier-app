/**
 * A fully dimensioned sketch must re-solve to the same positions, not a mirror solution. The
 * saved positions are the solver's start, so solving them must change nothing, even with noise.
 */
import type { ConstraintSolver, Sketch, SolveResult } from '@bezier/solver';
import { createSolver } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';

/** A at the origin, B 40 to its right, C 30 from A and 50 from B: (0, 30) or its mirror (0, -30). */
function triangle(c: { x: number; y: number }): Sketch {
  return {
    primitives: [
      { kind: 'point', id: 'a', x: 0, y: 0 },
      { kind: 'point', id: 'b', x: 38, y: 3 },
      { kind: 'point', id: 'c', x: c.x, y: c.y },
    ],
    constraints: [
      { kind: 'lock', id: 'lock-a', point: 'a', x: 0, y: 0 },
      { kind: 'horizontalPoints', id: 'level', a: 'a', b: 'b' },
      { kind: 'distance', id: 'ab', a: 'a', b: 'b', value: 40 },
      { kind: 'distance', id: 'ac', a: 'a', b: 'c', value: 30 },
      { kind: 'distance', id: 'bc', a: 'b', b: 'c', value: 50 },
    ],
  };
}

/** What a document keeps: the solved positions, written as text and read back. */
function saved(sketch: Sketch, result: SolveResult, noise = 0): Sketch {
  const stored = JSON.parse(
    JSON.stringify(
      sketch.primitives.map((p) => {
        const at = result.positions.get(p.id);
        return p.kind === 'point' && at ? { ...p, x: at.x + noise, y: at.y - noise } : p;
      }),
    ),
  );
  return { primitives: stored, constraints: sketch.constraints };
}

describe('a dimensioned sketch reopened', () => {
  let solver: ConstraintSolver;
  beforeAll(async () => {
    solver = await createSolver();
  }, 60_000);

  it.each([
    ['above', { x: 3, y: 22 }, 30],
    ['below', { x: -4, y: -18 }, -30],
  ])('keeps the point %s the line after it is saved and opened again', async (_name, start, y) => {
    const sketch = triangle(start);
    const first = await solver.solve(sketch);
    expect(first.status).toBe('solved');
    expect(first.dof).toBe(0);
    expect(first.positions.get('c')?.x).toBeCloseTo(0, 5);
    expect(first.positions.get('c')?.y).toBeCloseTo(y, 5);

    // Opened and solved again, ten times over, as many sessions would.
    let current = sketch;
    let last = first;
    for (let session = 0; session < 10; session++) {
      current = saved(current, last, session % 2 === 0 ? 1e-9 : 0);
      last = await solver.solve(current);
      expect(last.status).toBe('solved');
      expect(last.positions.get('c')?.y).toBeCloseTo(y, 5);
    }
  });

  it('stays on its side when the saved point was dragged almost across the line', async () => {
    // Not yet across: the point is still on the upper side, only close to the line it would flip over.
    const result = await solver.solve(triangle({ x: 1, y: 2 }));
    expect(result.status).toBe('solved');
    expect(result.positions.get('c')?.y).toBeGreaterThan(0);
  });
});
