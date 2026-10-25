/**
 * Sketch: a constrained 2D profile on a plane. Produces no solid. Stored unsolved; the rebuild
 * runs the solver, so a dimension change is an ordinary parameter change.
 */

import { defineFeature } from './registry.js';

export const sketchFeature = defineFeature({
  type: 'sketch',
  label: 'Sketch',

  params: {
    plane: {
      kind: 'choice',
      label: 'Plane',
      options: ['XY', 'XZ', 'YZ'],
      default: 'XY',
    },
    sketch: { kind: 'sketch', label: 'Geometry' },
    /** The flat face the sketch is on, if not an origin plane; followed on rebuild (ADR 0013). */
    face: { kind: 'geometryRefs', label: 'On face', of: 'face', default: [] },
    /** Offset from the plane or face along its normal. */
    offset: { kind: 'length', label: 'Offset', default: 0 },
    /** Rotation about the plane's own x axis, applied before the offset. */
    tilt: { kind: 'angle', label: 'Tilt', default: 0, min: -Math.PI, max: Math.PI },
    /** Then rotation about the plane's own y axis. */
    turn: { kind: 'angle', label: 'Turn', default: 0, min: -Math.PI, max: Math.PI },
  },

  /** None: a sketch adds no faces. */
  faceTags: [],

  async rebuild(_kernel, _params, input) {
    // Pass the body through, including null.
    return { ok: true, value: { body: input.body, evolution: null } };
  },
});
