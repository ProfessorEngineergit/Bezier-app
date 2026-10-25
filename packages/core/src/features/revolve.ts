/**
 * Revolve: spins a sketch profile about the u or v axis of its sketch plane (`planeBasis`).
 * Arbitrary axes are not supported.
 */

import { planeBasis } from '@bezier/core';
import { err } from '@bezier/kernel';
import { buildFromAreas, combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

const FACE_TAGS = ['start', 'end', 'side-*'] as const;

export const revolveFeature = defineFeature({
  type: 'revolve',
  label: 'Revolve',

  params: {
    sketch: { kind: 'featureRef', label: 'Sketch' },
    axis: { kind: 'choice', label: 'Axis', options: ['u', 'v'], default: 'u' },
    angleDegrees: {
      kind: 'angle',
      label: 'Angle',
      default: 360,
      degrees: true,
      min: 0.01,
      max: 360,
    },
    operation: {
      kind: 'choice',
      label: 'Result',
      options: ['new', 'add', 'cut'],
      default: 'new',
    },
    /** Helix pitch along the axis per turn and the number of turns (audit F-018). */
    pitch: { kind: 'length', label: 'Rise per turn', default: 0, min: -100000, max: 100000 },
    turns: { kind: 'factor', label: 'Turns', default: 1, min: 0.01, max: 1000 },
    /** Sketch regions to revolve; empty means all. */
    regions: { kind: 'regions', label: 'Profiles', default: [] },
  },

  faceTags: FACE_TAGS,

  async rebuild(kernel, params, input) {
    const profiles = input.profiles(params.sketch, params.regions);
    if (profiles === null || profiles.length === 0) {
      return err(
        'open-profile',
        profiles === null
          ? 'The sketch this revolve is built on could not be found or could not be solved.'
          : 'The sketch has no closed area to revolve. Close the outline first.',
      );
    }
    if (params.angleDegrees < 0.01 || params.angleDegrees > 360) {
      return err('invalid-result', 'Revolve angle must be between 0.01 and 360 degrees.');
    }

    // The axis comes from the sketch plane's basis.
    const basis = input.sketchPlane?.(params.sketch) ?? planeBasis('XY');
    if (basis === null) {
      return err('invalid-result', 'This sketch has no resolvable plane to revolve around.');
    }
    const axisDirection = params.axis === 'u' ? basis.xDirection : basis.yDirection;
    const climbs = params.pitch !== 0;
    const angleRadians = (params.angleDegrees * (climbs ? params.turns : 1) * Math.PI) / 180;

    const created = await buildFromAreas(kernel, profiles, (profile) =>
      climbs
        ? kernel.revolve(profile, profile.origin, axisDirection, angleRadians, params.pitch)
        : kernel.revolve(profile, profile.origin, axisDirection, angleRadians),
    );
    if (!created.ok) return created;

    return combineWithBody(kernel, input.body, created.value, params.operation);
  },
});
