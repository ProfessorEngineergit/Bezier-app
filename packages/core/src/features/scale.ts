/**
 * Scale: scales bodies about their bounding-box centre, measured at rebuild time. Faces keep their
 * names (ADR 0012).
 */
import { err } from '@bezier/kernel';
import { defineFeature } from './registry.js';
import { transformParts, unchangedBody } from './transform-parts.js';

export const scaleFeature = defineFeature({
  type: 'scale',
  label: 'Scale',
  params: {
    faces: { kind: 'geometryRefs', label: 'Bodies', of: 'face', default: [] },
    factor: { kind: 'factor', label: 'Factor', default: 1, min: 0.001, max: 1000 },
    // Per-axis factors on top of the overall factor (audit F-014).
    factorX: { kind: 'factor', label: 'Along X', default: 1, min: 0.001, max: 1000 },
    factorY: { kind: 'factor', label: 'Along Y', default: 1, min: 0.001, max: 1000 },
    factorZ: { kind: 'factor', label: 'Along Z', default: 1, min: 0.001, max: 1000 },
  },
  faceTags: [],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is nothing to scale yet.');
    const by = {
      x: params.factor * params.factorX,
      y: params.factor * params.factorY,
      z: params.factor * params.factorZ,
    };
    if (by.x === 1 && by.y === 1 && by.z === 1) return unchangedBody(kernel, input.body);
    return transformParts(kernel, input, params.faces, async (solids) => {
      const box = await kernel.bounds(solids);
      if (!box.ok) return box;
      const center = {
        x: (box.value.min.x + box.value.max.x) / 2,
        y: (box.value.min.y + box.value.max.y) / 2,
        z: (box.value.min.z + box.value.max.z) / 2,
      };
      return kernel.scale(solids, center, by.x === by.y && by.y === by.z ? by.x : by);
    });
  },
});
