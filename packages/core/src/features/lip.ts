/**
 * Lip and groove: how the two halves of a printed case locate on each other. On the rim of a shelled
 * part a lip stands up along the inside of the wall, and the other half's groove is that band cut
 * into its rim, wider and deeper by the clearance so the two slide together.
 */

import { err } from '@bezier/kernel';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

export const lipFeature = defineFeature({
  type: 'lip',
  label: 'Lip',
  params: {
    faces: { kind: 'geometryRefs', label: 'Rim', of: 'face', hidden: true },
    style: { kind: 'choice', label: 'Type', options: ['lip', 'groove'], default: 'lip' },
    width: { kind: 'length', label: 'Width', default: 1, min: 0.1 },
    height: { kind: 'length', label: 'Height', default: 2, min: 0.1 },
    clearance: { kind: 'length', label: 'Clearance', default: 0.2, min: 0 },
  },
  faceTags: ['side-*', 'end'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'A lip stands on a part.');
    const [ref] = params.faces;
    const face = ref === undefined ? null : await input.resolve(ref);
    if (face === null) {
      return err('invalid-result', 'The rim of this lip no longer exists. Select it again.');
    }
    const groove = params.style === 'groove';
    const band = await kernel.rimBand(
      face,
      groove ? params.width + params.clearance : params.width,
      groove ? -(params.height + params.clearance) : params.height,
    );
    if (!band.ok) return band;
    return combineWithBody(kernel, input.body, band.value, groove ? 'cut' : 'add', true);
  },
});
