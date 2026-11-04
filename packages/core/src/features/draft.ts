/** Draft: tilts the walls of a part so it comes out of a mould, away from the pull direction. */

import { err } from '@bezier/kernel';
import { planeBasis } from '../rebuild/plane.js';
import { defineFeature } from './registry.js';

export const draftFeature = defineFeature({
  type: 'draft',
  label: 'Draft',
  params: {
    faces: { kind: 'geometryRefs', label: 'Faces', of: 'face' },
    angle: {
      kind: 'angle',
      label: 'Angle',
      default: (2 * Math.PI) / 180,
      min: 0,
      max: Math.PI / 4,
    },
    plane: { kind: 'choice', label: 'Pull along', options: ['XY', 'XZ', 'YZ'], default: 'XY' },
  },
  faceTags: [],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is nothing to draft yet.');
    const basis = planeBasis(params.plane);
    if (basis === null) return err('invalid-result', 'A draft pulls along an origin plane.');
    const faces = [];
    for (const ref of params.faces) {
      const face = await input.resolve(ref);
      if (face === null) {
        return err('invalid-result', 'A face of this draft no longer exists. Select it again.');
      }
      faces.push(face);
    }
    if (faces.length === 0) return err('invalid-result', 'Select the faces to draft.');
    const drafted = await kernel.draftFaces(input.body, faces, params.angle, basis.normal);
    if (!drafted.ok) return drafted;
    return { ok: true, value: { body: drafted.value, evolution: null } };
  },
});
