import type { Sketch } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { markNewAsConstruction, toggleConstruction } from './sketch-construction.js';

const sketch: Sketch = {
  primitives: [
    { kind: 'point', id: 'a', x: 0, y: 0 },
    { kind: 'point', id: 'b', x: 10, y: 0 },
    { kind: 'line', id: 'l1', start: 'a', end: 'b' },
    { kind: 'circle', id: 'c1', center: 'a', radius: 5, construction: true },
  ],
  constraints: [],
};

describe('construction geometry', () => {
  it('turns a mixed selection all into construction, then all back', () => {
    const on = toggleConstruction(sketch, ['l1', 'c1', 'a']);
    expect(on.primitives.filter((p) => p.kind !== 'point').every((p) => p.construction)).toBe(true);
    const off = toggleConstruction(on, ['l1', 'c1']);
    expect(off.primitives.some((p) => 'construction' in p)).toBe(false);
  });

  it('leaves a sketch alone when nothing drawable is selected', () => {
    expect(toggleConstruction(sketch, ['a'])).toBe(sketch);
  });

  it('marks only what was just drawn', () => {
    const next: Sketch = {
      ...sketch,
      primitives: [
        ...sketch.primitives,
        { kind: 'point', id: 'c', x: 0, y: 10 },
        { kind: 'line', id: 'l2', start: 'a', end: 'c' },
      ],
    };
    const marked = markNewAsConstruction(sketch, next);
    const line = (id: string) => marked.primitives.find((p) => p.id === id);
    expect(line('l2')).toMatchObject({ construction: true });
    expect(line('l1')).not.toHaveProperty('construction');
    expect(markNewAsConstruction(sketch, sketch)).toBe(sketch);
  });
});
