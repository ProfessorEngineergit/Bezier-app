/**
 * Wrap: embosses or engraves sketch regions onto a cylindrical face, preserving arc length (audit
 * F-051, kernel `wrap.ts`). Shapes land on the half of the face facing the sketch plane.
 */

import { err } from '@bezier/kernel';
import { buildFromAreas, combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

export const wrapFeature = defineFeature({
  type: 'wrap',
  label: 'Wrap',
  params: {
    sketch: { kind: 'featureRef', label: 'Sketch' },
    faces: { kind: 'geometryRefs', label: 'Round face', of: 'face', default: [] },
    height: { kind: 'length', label: 'Height', default: 1, min: -1000, max: 1000 },
    /** Sketch regions to wrap; empty means all. */
    regions: { kind: 'regions', label: 'Profiles', default: [] },
  },
  faceTags: ['wall-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is no body to wrap onto.');
    const profiles = input.profiles(params.sketch, params.regions);
    if (profiles === null || profiles.length === 0)
      return err(
        'open-profile',
        'The sketch has no closed shape to wrap. Close the outline first.',
      );
    const [ref] = params.faces;
    const face = ref === undefined ? null : await input.resolve(ref);
    if (face === null) return err('invalid-result', 'Pick the round face to wrap onto.');
    if (params.height === 0) return err('invalid-result', 'Give the wrap a height, or a depth.');
    // One combined tool, so the body is modified once with a single history.
    const tool = await buildFromAreas(kernel, profiles, (profile) =>
      kernel.wrapTool(face, profile, params.height),
    );
    if (!tool.ok) return tool;
    return combineWithBody(kernel, input.body, tool.value, params.height > 0 ? 'add' : 'cut');
  },
});
