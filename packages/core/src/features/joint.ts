/**
 * Joint (audit F-054): a revolute or slider joint whose axis comes from a face of the other part
 * (a round face's axis, or a flat face's normal through its centre). The value is clamped to
 * limits, and the joint follows the referenced part.
 */

import { err, type Vec3 } from '@bezier/kernel';
import { defineFeature } from './registry.js';
import { transformParts, unchangedBody } from './transform-parts.js';

const REVOLUTE = { kind: ['revolute'] } as const;
const SLIDER = { kind: ['slider'] } as const;

export const jointFeature = defineFeature({
  type: 'joint',
  label: 'Joint',
  params: {
    kind: { kind: 'choice', label: 'Kind', options: ['revolute', 'slider'], default: 'revolute' },
    faces: { kind: 'geometryRefs', label: 'Moving part', of: 'face', default: [] },
    axis: { kind: 'geometryRefs', label: 'Axis from', of: 'face', default: [] },
    angle: { kind: 'angle', label: 'Angle', default: 0, when: REVOLUTE },
    minAngle: { kind: 'angle', label: 'Least angle', default: -Math.PI, when: REVOLUTE },
    maxAngle: { kind: 'angle', label: 'Most angle', default: Math.PI, when: REVOLUTE },
    distance: { kind: 'length', label: 'Distance', default: 0, min: -1e5, max: 1e5, when: SLIDER },
    minDistance: {
      kind: 'length',
      label: 'Least distance',
      default: -100,
      min: -1e5,
      max: 1e5,
      when: SLIDER,
    },
    maxDistance: {
      kind: 'length',
      label: 'Most distance',
      default: 100,
      min: -1e5,
      max: 1e5,
      when: SLIDER,
    },
  },
  faceTags: [],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There are no parts to join.');
    const [axisRef] = params.axis;
    const axisFace = axisRef === undefined ? null : await input.resolve(axisRef);
    if (axisFace === null)
      return err('invalid-result', 'Pick the face the joint turns or slides on.');
    if (params.faces.length === 0)
      return err('invalid-result', 'Pick a face of the part that moves.');
    const round = await kernel.faceCylinder(axisFace);
    let origin: Vec3;
    let direction: Vec3;
    if (round.ok && round.value !== null) {
      origin = round.value.origin;
      direction = round.value.axis;
    } else {
      const plane = await kernel.facePlane(axisFace);
      if (!plane.ok)
        return err('invalid-result', 'The axis comes from a round face or a flat one.');
      origin = plane.value.origin;
      direction = plane.value.normal;
    }
    const clamp = (value: number, low: number, high: number) =>
      Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high));
    if (params.kind === 'revolute') {
      const angle = clamp(params.angle, params.minAngle, params.maxAngle);
      if (angle === 0) return unchangedBody(kernel, input.body);
      return transformParts(kernel, input, params.faces, (body) =>
        kernel.rotate(body, origin, direction, angle),
      );
    }
    const distance = clamp(params.distance, params.minDistance, params.maxDistance);
    if (distance === 0) return unchangedBody(kernel, input.body);
    return transformParts(kernel, input, params.faces, (body) =>
      kernel.translate(body, {
        x: direction.x * distance,
        y: direction.y * distance,
        z: direction.z * distance,
      }),
    );
  },
});
