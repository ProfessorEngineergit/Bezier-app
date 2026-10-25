import type { SketchId } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { deleteSketchPrimitives } from './sketch-delete.js';
import { connect, emptySketch, ensurePoint, rectangleAt } from './sketch-tools.js';

describe('deleteSketchPrimitives', () => {
  it('removes one selected line, its constraint, and only its orphaned point', () => {
    const rectangle = rectangleAt(emptySketch(), { u: 0, v: 0 }, { u: 20, v: 10 });
    const line = rectangle.primitives.find((primitive) => primitive.kind === 'line');
    if (line === undefined || line.kind !== 'line') throw new Error('missing test line');

    const next = deleteSketchPrimitives(rectangle, new Set([line.id]));

    expect(next.primitives.filter((primitive) => primitive.kind === 'line')).toHaveLength(3);
    expect(next.primitives.filter((primitive) => primitive.kind === 'point')).toHaveLength(4);
    expect(
      next.constraints.some((constraint) => 'line' in constraint && constraint.line === line.id),
    ).toBe(false);
  });

  it('removes endpoints that no remaining geometry uses', () => {
    const a = ensurePoint(emptySketch(), { u: 0, v: 0 });
    const b = ensurePoint(a.sketch, { u: 10, v: 0 });
    const sketch = connect(b.sketch, a.id, b.id);
    const line = sketch.primitives.find((primitive) => primitive.kind === 'line');
    if (line === undefined) throw new Error('missing test line');

    expect(deleteSketchPrimitives(sketch, new Set([line.id])).primitives).toEqual([]);
  });

  it('returns the same object for an empty selection', () => {
    const sketch = emptySketch();
    expect(deleteSketchPrimitives(sketch, new Set<SketchId>())).toBe(sketch);
  });
});
