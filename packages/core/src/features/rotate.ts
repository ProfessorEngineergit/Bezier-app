/** Rotate a body about an explicit world-space pivot, preserving face provenance. */
import { err } from '@bezier/kernel';
import { defineFeature } from './registry.js';
import { transformParts, unchangedBody } from './transform-parts.js';

export const rotateFeature = defineFeature({
  type: 'rotate',
  label: 'Rotate',
  params: {
    faces: { kind: 'geometryRefs', label: 'Bodies', of: 'face', default: [] },
    axis: { kind: 'choice', label: 'Axis', options: ['x', 'y', 'z'], default: 'z' },
    angle: { kind: 'angle', label: 'Angle', default: 0 },
    ox: { kind: 'length', label: 'Pivot X', default: 0 },
    oy: { kind: 'length', label: 'Pivot Y', default: 0 },
    oz: { kind: 'length', label: 'Pivot Z', default: 0 },
  },
  faceTags: [],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is nothing to rotate yet.');
    if (params.angle === 0) return unchangedBody(kernel, input.body);
    return transformParts(kernel, input, params.faces, (body) =>
      kernel.rotate(
        body,
        { x: params.ox, y: params.oy, z: params.oz },
        { x: +(params.axis === 'x'), y: +(params.axis === 'y'), z: +(params.axis === 'z') },
        params.angle,
      ),
    );
  },
});
