/**
 * Deletes faces and heals the gap from the surrounding faces, e.g. removing a fillet, boss or
 * pocket (audit F-068).
 */

import { err, type ShapeId } from '@bezier/kernel';
import { formatRef } from '../stable-ref.js';
import { withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

export const removeFacesFeature = defineFeature({
  type: 'remove-faces',
  label: 'Delete face',

  params: {
    faces: { kind: 'geometryRefs', label: 'Faces', of: 'face' },
  },

  /** None: neighbouring faces extend. */
  faceTags: [],

  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is nothing to delete faces from.');
    if (params.faces.length === 0) return err('invalid-result', 'Select the faces to delete.');
    const handles: ShapeId[] = [];
    const lost: string[] = [];
    for (const ref of params.faces) {
      const handle = await input.resolve(ref);
      if (handle === null) lost.push(formatRef(ref));
      else handles.push(handle);
    }
    if (lost.length > 0)
      return err(
        'invalid-result',
        'A face this step deletes no longer exists. Pick it again.',
        lost.join(', '),
      );
    return withinOwningSolids(kernel, input.body, handles, (solids) =>
      kernel.removeFaces(solids, handles),
    );
  },
});
