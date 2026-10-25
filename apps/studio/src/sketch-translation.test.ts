import { planeBasis } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
import { expect, it } from 'vitest';
import { translatedSketch } from './sketch-translation.js';

it('moves points and fixed constraints in the plane and carries normal motion as plane offset', () => {
  const basis = planeBasis('YZ');
  if (!basis) throw new Error('Missing YZ plane');
  const sketch: Sketch = {
    primitives: [{ kind: 'point', id: 'p', x: 2, y: 3 }],
    constraints: [{ kind: 'lock', id: 'c', point: 'p', x: 2, y: 3 }],
  };
  const result = translatedSketch(sketch, basis, { x: 10, y: 20, z: 30 });
  expect(result.offset).toBe(10);
  expect(result.sketch.primitives[0]).toMatchObject({ x: 22, y: 33 });
  expect(result.sketch.constraints[0]).toMatchObject({ x: 22, y: 33 });
  expect(sketch.primitives[0]).toMatchObject({ x: 2, y: 3 });
});
