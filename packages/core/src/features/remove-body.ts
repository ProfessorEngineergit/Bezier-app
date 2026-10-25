/**
 * Remove: deletes whole bodies as a history step, selected by one face of each (ADR 0012).
 */

import { err } from '@bezier/kernel';
import { resolveFaces } from './bodies.js';
import { defineFeature } from './registry.js';
import { unchangedBody } from './transform-parts.js';

export const removeBodyFeature = defineFeature({
  type: 'remove-body',
  label: 'Remove',

  params: {
    faces: { kind: 'geometryRefs', label: 'Bodies', of: 'face' },
  },

  /** None: removing makes no faces. */
  faceTags: [],

  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is no body to remove.');
    const faces = await resolveFaces(input, params.faces, 'bodies to remove');
    if (!faces.ok) return faces;

    const parts = await kernel.partition(input.body, faces.value);
    if (!parts.ok) return parts;
    await kernel.dispose(parts.value.selected);

    const kept = parts.value.remainder;
    if (kept === null) return { ok: true, value: { body: null, evolution: null, cleared: true } };
    // Faces of the remaining bodies are unchanged.
    return unchangedBody(kernel, kept);
  },
});
