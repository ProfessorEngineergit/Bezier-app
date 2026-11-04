/** A coil spring wound round an axis from the origin, along the normal of an origin plane. */

import type { Profile } from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { planeBasis } from '../rebuild/plane.js';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

const cross = (a: Profile['normal'], b: Profile['normal']) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const springFeature = defineFeature({
  type: 'spring',
  label: 'Spring',
  params: {
    diameter: { kind: 'length', label: 'Coil diameter', default: 20, min: 0.1 },
    wire: { kind: 'length', label: 'Wire diameter', default: 2, min: 0.01 },
    pitch: { kind: 'length', label: 'Pitch', default: 5, min: 0.01 },
    turns: { kind: 'factor', label: 'Turns', default: 6, min: 0.25, max: 200, plain: true },
    plane: {
      more: true,
      kind: 'choice',
      label: 'Plane',
      options: ['XY', 'XZ', 'YZ'],
      default: 'XY',
    },
    operation: {
      more: true,
      kind: 'choice',
      label: 'Result',
      options: ['new', 'add', 'cut'],
      default: 'new',
    },
  },
  faceTags: ['start', 'end', 'side-*'],
  async rebuild(kernel, params, input) {
    const basis = planeBasis(params.plane);
    if (basis === null) return err('invalid-result', 'A spring stands on an origin plane.');
    if (params.wire >= params.diameter) {
      return err('invalid-result', 'The wire is as thick as the coil is wide.');
    }
    if (params.wire >= params.pitch) {
      return err(
        'invalid-result',
        'The coils run into each other: the pitch must exceed the wire.',
      );
    }
    // The wire's section stands in the plane through the axis, at the coil's radius.
    const profile: Profile = {
      loops: [
        [{ kind: 'circle', center: { x: params.diameter / 2, y: 0 }, radius: params.wire / 2 }],
      ],
      origin: basis.origin,
      normal: cross(basis.xDirection, basis.normal),
      xDirection: basis.xDirection,
    };
    const created = await kernel.revolve(
      profile,
      basis.origin,
      basis.normal,
      params.turns * 2 * Math.PI,
      params.pitch,
    );
    if (!created.ok) return created;
    return combineWithBody(kernel, input.body, created.value, params.operation);
  },
});
