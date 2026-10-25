import type { CadDocument } from '@bezier/core';
import { describe, expect, it } from 'vitest';
import { countedName, freeName } from './feature-names.js';

const doc = (...names: string[]) =>
  ({
    features: names.map((name, i) => ({ id: `f${String(i)}`, type: 'x', name, params: {} })),
  }) as unknown as CadDocument;

describe('names for new things', () => {
  it('counts sketches from one', () => {
    expect(countedName(doc(), 'Sketch')).toBe('Sketch 1');
    expect(countedName(doc('Sketch 1'), 'Sketch')).toBe('Sketch 2');
    expect(countedName(doc('Sketch 1', 'Extrude', 'Sketch 2'), 'Sketch')).toBe('Sketch 3');
  });

  it('continues after sketches that were all called the same, and skips a name that is taken', () => {
    expect(countedName(doc('Sketch', 'Sketch', 'Sketch'), 'Sketch')).toBe('Sketch 4');
    expect(countedName(doc('Sketch 2'), 'Sketch')).toBe('Sketch 3');
    expect(countedName(doc('Sketch 1', 'Sketch 3'), 'Sketch')).toBe('Sketch 4');
    // A sketch that was renamed does not count, and a name someone gave is never reused.
    expect(countedName(doc('Base plate', 'Sketch 1'), 'Sketch')).toBe('Sketch 2');
  });

  it('keeps the name of a file when it is free, and numbers the second of the same', () => {
    expect(freeName(doc(), 'bracket')).toBe('bracket');
    expect(freeName(doc('bracket'), 'bracket')).toBe('bracket 2');
    expect(freeName(doc('bracket', 'bracket 2'), 'bracket')).toBe('bracket 3');
    expect(freeName(doc('a.b (1)'), 'a.b (1)')).toBe('a.b (1) 2');
  });
});
