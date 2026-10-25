/** Translate selected solids through the journal, carrying their face provenance. */
import { err } from '@bezier/kernel';
import { defineFeature } from './registry.js';
import { transformParts, unchangedBody } from './transform-parts.js';
export const moveFeature = defineFeature({
  type: 'move',
  label: 'Move',
  params: {
    dx: { kind: 'length', label: 'X', default: 0 },
    dy: { kind: 'length', label: 'Y', default: 0 },
    dz: { kind: 'length', label: 'Z', default: 0 },
    faces: { kind: 'geometryRefs', label: 'Bodies', of: 'face', default: [] },
  },
  faceTags: [],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is nothing to move yet.');
    if (params.dx === 0 && params.dy === 0 && params.dz === 0)
      return unchangedBody(kernel, input.body);
    return transformParts(kernel, input, params.faces, (body) =>
      kernel.translate(body, { x: params.dx, y: params.dy, z: params.dz }),
    );
  },
});
