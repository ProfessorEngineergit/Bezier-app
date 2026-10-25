import type { StableRef } from '@bezier/core';
import { describe, expect, it } from 'vitest';
import { faceBoxes, snapBoxes } from './snap-boxes.js';

const face = (feature: string, tag: string): StableRef =>
  ({ kind: 'face', feature, tag }) as unknown as StableRef;

/** Two triangles, one a face of the first body (0..10) and one of the second (20..30). */
const source = {
  mesh: {
    positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 10, 20, 0, 0, 30, 5, 0, 20, 5, 8]),
    indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    triangleFaces: new Uint32Array([0, 1]),
  },
  faceRefs: [face('a', 'side-0'), face('b', 'side-0')],
  bodyRefs: [[face('a', 'side-0')], [face('b', 'side-0')]],
};

describe('snapBoxes', () => {
  it('boxes every face from the mesh', () => {
    const boxes = faceBoxes(source);
    expect(boxes.get(0)).toEqual({ min: [0, 0, 0], max: [10, 10, 10] });
    expect(boxes.get(1)).toEqual({ min: [20, 0, 0], max: [30, 5, 8] });
  });

  it('takes the selected body as the moving box and the rest as targets', () => {
    const result = snapBoxes(
      source,
      [face('a', 'side-0')],
      (f) => `Body of ${String((f as { feature: string }).feature)}`,
    );
    expect(result.moving).toEqual({ min: [0, 0, 0], max: [10, 10, 10] });
    expect(result.others).toEqual([{ min: [20, 0, 0], max: [30, 5, 8] }]);
    expect(result.names).toEqual(['Body of b']);
  });

  it('has no moving box when nothing selected is a body, and no source gives nothing', () => {
    expect(snapBoxes(source, [], () => null).moving).toBeNull();
    expect(snapBoxes(null, [], () => null)).toEqual({ moving: null, others: [], names: [] });
  });
});
