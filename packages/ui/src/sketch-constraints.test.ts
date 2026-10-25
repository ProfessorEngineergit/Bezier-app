import type { ConstraintSolver, Sketch, SolveResult } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { constrain, dimension, solveInto, unconstrain } from './sketch-constraints.js';
import { circleFromCenter } from './sketch-curves.js';
import { connect, emptySketch, ensurePoint, rectangleAt } from './sketch-tools.js';

/** Two separate lines: a from (0,0) to (10,1), b from (0,5) to (8,9). */
function twoLines(): Sketch {
  const a0 = ensurePoint(emptySketch(), { u: 0, v: 0 });
  const a1 = ensurePoint(a0.sketch, { u: 10, v: 1 });
  const b0 = ensurePoint(connect(a1.sketch, a0.id, a1.id), { u: 0, v: 5 });
  const b1 = ensurePoint(b0.sketch, { u: 8, v: 9 });
  return connect(b1.sketch, b0.id, b1.id);
}

const lineIds = (sketch: Sketch) =>
  sketch.primitives.filter((p) => p.kind === 'line').map((p) => p.id);

describe('constraining a selection', () => {
  it('makes each selected line horizontal, once', () => {
    const sketch = twoLines();
    const result = constrain(sketch, 'horizontal', lineIds(sketch));
    expect(result.ok && result.added.map((c) => c.kind)).toEqual(['horizontal', 'horizontal']);
    if (!result.ok) return;
    const again = constrain(result.sketch, 'vertical', lineIds(sketch));
    expect(again.ok).toBe(false);
  });

  it('asks for exactly two lines for parallel', () => {
    const sketch = twoLines();
    const [first] = lineIds(sketch);
    expect(constrain(sketch, 'parallel', first === undefined ? [] : [first])).toEqual({
      ok: false,
      message: 'Select exactly two lines.',
    });
    const both = constrain(sketch, 'parallel', lineIds(sketch));
    expect(both.ok && both.added[0]?.kind).toBe('parallel');
  });

  it('joins the nearest ends for coincident', () => {
    const sketch = twoLines();
    const result = constrain(sketch, 'coincident', lineIds(sketch));
    const added = result.ok ? result.added[0] : undefined;
    expect(added?.kind).toBe('coincident');
  });

  it('fixes the points of a selection where they are', () => {
    const sketch = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 20, v: 10 });
    const [line] = lineIds(sketch);
    const result = constrain(sketch, 'fix', line === undefined ? [] : [line]);
    expect(result.ok && result.added.map((c) => c.kind)).toEqual(['lock', 'lock']);
  });

  it('never reuses an id', () => {
    let sketch = twoLines();
    for (const tool of ['parallel', 'equal', 'perpendicular'] as const) {
      const result = constrain(sketch, tool, lineIds(sketch));
      if (!result.ok) throw new Error(result.message);
      sketch = result.sketch;
    }
    const ids = [...sketch.primitives.map((p) => p.id), ...sketch.constraints.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('asks for two round things for concentric', () => {
    const center = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const one = circleFromCenter(center.sketch, center.id, { u: 5, v: 0 });
    const other = ensurePoint(one, { u: 3, v: 3 });
    const two = circleFromCenter(other.sketch, other.id, { u: 6, v: 3 });
    const circles = two.primitives.filter((p) => p.kind === 'circle').map((p) => p.id);
    const result = constrain(two, 'concentric', circles);
    expect(result.ok && result.added[0]?.kind).toBe('concentric');
  });
});

describe('dimensions as constraints', () => {
  it('replaces a line’s length rather than stacking a second one', () => {
    const sketch = twoLines();
    const [line] = lineIds(sketch);
    if (line === undefined) throw new Error('no line');
    const once = dimension(sketch, line, 12);
    const twice = dimension(once, line, 15);
    const lengths = twice.constraints.filter((c) => c.kind === 'distance');
    expect(lengths).toHaveLength(1);
    expect(lengths[0]?.kind === 'distance' && lengths[0].value).toBe(15);
  });

  it('can be taken back out', () => {
    const sketch = twoLines();
    const [line] = lineIds(sketch);
    if (line === undefined) throw new Error('no line');
    const sized = dimension(sketch, line, 12);
    const id = sized.constraints[sized.constraints.length - 1]?.id ?? '';
    expect(unconstrain(sized, id).constraints).toEqual(sketch.constraints);
  });
});

describe('solving into the drawing', () => {
  const solved = (overrides: Partial<SolveResult>): ConstraintSolver => ({
    solve: (sketch) => ({
      status: 'solved',
      positions: new Map(
        sketch.primitives.flatMap((p) =>
          p.kind === 'point' ? [[p.id, { x: p.x + 1, y: p.y }] as const] : [],
        ),
      ),
      radii: new Map(),
      dof: 0,
      conflicting: [],
      redundant: [],
      ...overrides,
    }),
    dispose: () => {},
  });

  it('writes the solved positions into the points', () => {
    const sketch = twoLines();
    const result = solveInto(sketch, solved({}));
    const first = result.ok ? result.sketch.primitives.find((p) => p.kind === 'point') : undefined;
    expect(first?.kind === 'point' && first.x).toBe(1);
  });

  it('refuses a contradiction and names what it contradicts', () => {
    const sketch = twoLines();
    const constrained = constrain(sketch, 'horizontal', lineIds(sketch));
    if (!constrained.ok) throw new Error(constrained.message);
    const id = constrained.added[0]?.id ?? '';
    const result = solveInto(
      constrained.sketch,
      solved({ status: 'conflicting', conflicting: [id] }),
    );
    expect(result).toMatchObject({ ok: false, message: 'That contradicts horizontal.' });
  });
});
