/** Shell: hollows a solid, removing the picked faces as openings. Structured like fillet.ts. */

import { err, type ShapeId } from '@bezier/kernel';
import { formatRef } from '../stable-ref.js';
import { withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

export const shellFeature = defineFeature({
  type: 'shell',
  label: 'Shell',

  params: {
    faces: { kind: 'geometryRefs', label: 'Faces to remove', of: 'face' },
    thickness: { kind: 'length', label: 'Thickness', default: 2, min: 0.001 },
  },

  /** New interior walls. */
  faceTags: ['wall-*'],

  async rebuild(kernel, params, input) {
    if (input.body === null) {
      return err('invalid-result', 'There is nothing to shell yet.');
    }
    if (params.faces.length === 0) {
      return err('invalid-result', 'Select at least one face to remove.');
    }

    const handles: ShapeId[] = [];
    const lost: string[] = [];
    for (const ref of params.faces) {
      const handle = await input.resolve(ref);
      if (handle === null) lost.push(formatRef(ref));
      else handles.push(handle);
    }

    if (lost.length > 0) {
      return err(
        'invalid-result',
        lost.length === params.faces.length
          ? 'The faces this shell was attached to no longer exist. Pick them again.'
          : `${lost.length} of ${params.faces.length} shelled faces no longer exist. Pick them again.`,
        lost.join(', '),
      );
    }

    // OCCT cannot shell a multi-part compound, so only the owning part is shelled.
    return withinOwningSolids(kernel, input.body, handles, (solids) =>
      kernel.shell(solids, handles, params.thickness),
    );
  },
});
