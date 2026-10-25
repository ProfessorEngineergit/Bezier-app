/** Copy keeps the source solid and assigns independent provenance to the new faces. */
import { err } from '@bezier/kernel';
import { defineFeature } from './registry.js';
import { transformParts, unchangedBody } from './transform-parts.js';

export const transformCopyFeature = defineFeature({
  type: 'transform-copy',
  label: 'Copy',
  params: {
    faces: { kind: 'geometryRefs', label: 'Bodies', of: 'face', default: [] },
    dx: { kind: 'length', label: 'X', default: 0 },
    dy: { kind: 'length', label: 'Y', default: 0 },
    dz: { kind: 'length', label: 'Z', default: 0 },
    axis: { kind: 'choice', label: 'Axis', options: ['x', 'y', 'z'], default: 'z' },
    angle: { kind: 'angle', label: 'Angle', default: 0 },
    ox: { kind: 'length', label: 'Pivot X', default: 0 },
    oy: { kind: 'length', label: 'Pivot Y', default: 0 },
    oz: { kind: 'length', label: 'Pivot Z', default: 0 },
  },
  faceTags: ['copy-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'Select a body to copy.');
    if (params.angle === 0 && params.dx === 0 && params.dy === 0 && params.dz === 0)
      return unchangedBody(kernel, input.body);
    return transformParts(
      kernel,
      input,
      params.faces,
      (body) =>
        params.angle === 0
          ? kernel.translate(body, { x: params.dx, y: params.dy, z: params.dz })
          : kernel.rotate(
              body,
              { x: params.ox, y: params.oy, z: params.oz },
              { x: +(params.axis === 'x'), y: +(params.axis === 'y'), z: +(params.axis === 'z') },
              params.angle,
            ),
      true,
    );
  },
});
