/** Extrude: a sketch profile into a solid. The reference example of a feature definition. */

import { err } from '@bezier/kernel';
import {
  buildFromAreas,
  combineWithBody,
  depthThrough,
  resolveFaces,
  withinOwningSolids,
} from './bodies.js';
import { defineFeature } from './registry.js';

/** Face tags (a compatibility promise, see `registry.ts`). `side-*` expands per profile segment. */
const FACE_TAGS = ['start', 'end', 'side-*'] as const;

export const extrudeFeature = defineFeature({
  type: 'extrude',
  label: 'Extrude',

  params: {
    sketch: { kind: 'featureRef', label: 'Sketch' },
    distance: { kind: 'length', label: 'Distance', default: 10, min: 0.001 },
    /** A choice rather than a signed distance, for readability in the panel. */
    direction: {
      kind: 'choice',
      label: 'Direction',
      options: ['forward', 'backward', 'symmetric'],
      default: 'forward',
    },
    operation: {
      kind: 'choice',
      label: 'Result',
      options: ['new', 'add', 'cut'],
      default: 'new',
    },
    /** A fixed distance, or through all (measured on each rebuild). */
    extent: {
      kind: 'choice',
      label: 'Extent',
      options: ['distance', 'through'],
      default: 'distance',
    },
    /** Draft angle in degrees; positive tapers inward (audit F-016). */
    taper: { kind: 'angle', label: 'Taper', default: 0, degrees: true, min: -45, max: 45 },
    /** Sketch regions to extrude; empty means all. */
    regions: { kind: 'regions', label: 'Profiles', default: [] },
    /** Bodies that add/cut may change, by any face of each. Empty means every body reached. */
    targets: { kind: 'geometryRefs', label: 'Only in', of: 'face', default: [], hidden: true },
    /**
     * Merge coplanar walls without a seam. Off by default so saved documents keep their face
     * names; the app sets it on new extrusions.
     */
    merge: { kind: 'boolean', label: 'One wall, without a seam', default: false, hidden: true },
  },

  faceTags: FACE_TAGS,

  async rebuild(kernel, params, input) {
    const profiles = input.profiles(params.sketch, params.regions);
    if (profiles === null) {
      return err(
        'open-profile',
        'The sketch this extrusion is built on could not be found or could not be solved.',
      );
    }
    if (profiles.length === 0) {
      return err(
        'open-profile',
        params.regions.length > 0
          ? 'The areas this extrusion used are no longer closed in the sketch.'
          : 'The sketch has no closed area to extrude. Close the outline first.',
      );
    }

    const created = await buildFromAreas(kernel, profiles, async (profile) => {
      let length = params.distance;
      if (params.extent === 'through') {
        if (input.body === null)
          return err('invalid-result', 'There is nothing yet to extrude through.');
        const depth = await depthThrough(kernel, input.body, profile.origin, profile.normal);
        if (!depth.ok) return depth;
        // Symmetric needs the depth on both sides.
        length = params.direction === 'symmetric' ? depth.value * 2 : depth.value;
      }
      const distance = params.direction === 'backward' ? -length : length;
      // Symmetric starts half the length back so the profile is in the middle.
      const origin =
        params.direction === 'symmetric'
          ? {
              x: profile.origin.x - (profile.normal.x * length) / 2,
              y: profile.origin.y - (profile.normal.y * length) / 2,
              z: profile.origin.z - (profile.normal.z * length) / 2,
            }
          : profile.origin;
      return params.taper === 0
        ? kernel.extrude({ ...profile, origin }, distance)
        : kernel.extrude({ ...profile, origin }, distance, params.taper);
    });
    if (!created.ok) return created;

    if (params.operation === 'new' || params.targets.length === 0 || input.body === null) {
      return combineWithBody(kernel, input.body, created.value, params.operation, params.merge);
    }
    const targets = await resolveFaces(input, params.targets, 'body to change');
    if (!targets.ok) {
      await kernel.dispose(created.value);
      return targets;
    }
    const tool = created.value;
    try {
      return await withinOwningSolids(kernel, input.body, targets.value, (solids) =>
        params.operation === 'add'
          ? kernel.fuse(solids, tool, { merge: params.merge })
          : kernel.cut(solids, tool),
      );
    } finally {
      await kernel.dispose(tool);
    }
  },
});
