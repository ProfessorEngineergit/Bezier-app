/**
 * Loft: a solid between one region in each of two sketches, smooth or ruled (ADR 0017, audit
 * F-033). Sketches with several regions must be narrowed to one.
 */

import { err } from '@bezier/kernel';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

export const loftFeature = defineFeature({
  type: 'loft',
  label: 'Loft',
  params: {
    from: { kind: 'featureRef', label: 'From sketch' },
    to: { kind: 'featureRef', label: 'To sketch' },
    ruled: { kind: 'boolean', label: 'Straight sides', default: false },
    operation: {
      kind: 'choice',
      label: 'Result',
      options: ['new', 'add', 'cut'],
      default: 'new',
    },
  },
  faceTags: ['start', 'end', 'side-*'],
  async rebuild(kernel, params, input) {
    const sections = [params.from, params.to].map((sketch) => input.profiles(sketch));
    for (const section of sections) {
      if (section === null)
        return err('open-profile', 'A sketch this loft goes through could not be found or solved.');
      if (section.length !== 1)
        return err(
          'open-profile',
          section.length === 0
            ? 'Each sketch of a loft needs one closed area; one of them has none.'
            : 'Each sketch of a loft needs exactly one closed area; one of them has several.',
        );
    }
    const created = await kernel.loft(
      sections.map((section) => section?.[0]).filter((profile) => profile !== undefined),
      params.ruled,
    );
    if (!created.ok) return created;
    return combineWithBody(kernel, input.body, created.value, params.operation);
  },
});
