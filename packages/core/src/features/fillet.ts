/**
 * Fillet: rounds selected edges. The main consumer of edge references (`stable-ref.ts`) and the
 * operation the kernel refuses most often.
 */

import { err, type ShapeId } from '@bezier/kernel';
import { formatRef } from '../stable-ref.js';
import { facesBeside, withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

export const filletFeature = defineFeature({
  type: 'fillet',
  label: 'Fillet',

  params: {
    edges: { kind: 'geometryRefs', label: 'Edges', of: 'edge' },
    radius: { kind: 'length', label: 'Radius', default: 2, min: 0.001 },
  },

  /** One rounded surface per edge. */
  faceTags: ['blend-*'],

  async rebuild(kernel, params, input) {
    if (input.body === null) {
      return err('invalid-result', 'There is nothing to round yet.');
    }
    if (params.edges.length === 0) {
      return err('invalid-result', 'Select at least one edge to round.');
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
          ? 'The edges this round was attached to no longer exist. Pick them again.'
          : `${lost.length} of ${params.edges.length} rounded edges no longer exist. Pick them again.`,
        lost.join(', '),
      );
    }

    // Only the owning parts: OCCT refuses fillets on a large compound (every edge of the Voron,
    // 1715 solids, even at 0.2 mm; bench/src/large-import.ts).
    return withinOwningSolids(
      kernel,
      input.body,
      await facesBeside(input, params.edges),
      (solids) => kernel.fillet(solids, handles, params.radius),
    );
  },
});
