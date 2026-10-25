/** Chamfer: bevels selected edges. Mirrors fillet.ts with a distance instead of a radius. */

import { err, type ShapeId } from '@bezier/kernel';
import { formatRef } from '../stable-ref.js';
import { facesBeside, withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

export const chamferFeature = defineFeature({
  type: 'chamfer',
  label: 'Chamfer',

  params: {
    edges: { kind: 'geometryRefs', label: 'Edges', of: 'edge' },
    distance: { kind: 'length', label: 'Distance', default: 2, min: 0.001 },
    // Second leg on the other face; zero means equal legs (audit F-010).
    distance2: { kind: 'length', label: 'Other distance', default: 0, min: 0 },
  },

  /** One flat bevel per edge. */
  faceTags: ['bevel-*'],

  async rebuild(kernel, params, input) {
    if (input.body === null) {
      return err('invalid-result', 'There is nothing to bevel yet.');
    }
    if (params.edges.length === 0) {
      return err('invalid-result', 'Select at least one edge to bevel.');
    }

    // Resolve every reference before calling the kernel, so a lost selection is reported by name.
    const handles: ShapeId[] = [];
    const lost = [];
    for (const ref of params.edges) {
      const handle = await input.resolve(ref);
      if (handle === null) lost.push(formatRef(ref));
      else handles.push(handle);
    }

    if (lost.length > 0) {
      return err(
        'invalid-result',
        lost.length === params.edges.length
          ? 'The edges this bevel was attached to no longer exist. Pick them again.'
          : `${lost.length} of ${params.edges.length} beveled edges no longer exist. Pick them again.`,
        lost.join(', '),
      );
    }

    // Only the owning parts: OCCT refuses chamfers on a large compound (every edge of the Voron,
    // 1715 solids, even at 0.2 mm; bench/src/large-import.ts).
    return withinOwningSolids(
      kernel,
      input.body,
      await facesBeside(input, params.edges),
      (solids) =>
        params.distance2 > 0
          ? kernel.chamfer(solids, handles, params.distance, params.distance2)
          : kernel.chamfer(solids, handles, params.distance),
    );
  },
});
