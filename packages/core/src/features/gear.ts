/** A spur gear generated from its numbers, on an origin plane, centred on the origin. */

import type { Profile } from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { planeBasis } from '../rebuild/plane.js';
import { combineWithBody } from './bodies.js';
import { gearCircles, gearOutline, MIN_TEETH } from './gear-profile.js';
import { defineFeature } from './registry.js';

export const gearFeature = defineFeature({
  type: 'gear',
  label: 'Gear',
  params: {
    teeth: { kind: 'count', label: 'Teeth', default: 20, min: MIN_TEETH },
    module: { kind: 'length', label: 'Module', default: 2, min: 0.1 },
    width: { kind: 'length', label: 'Width', default: 10, min: 0.01 },
    bore: { kind: 'length', label: 'Bore', default: 8, min: 0 },
    pressureAngle: {
      more: true,
      kind: 'angle',
      label: 'Pressure angle',
      default: (20 * Math.PI) / 180,
      min: (10 * Math.PI) / 180,
      max: (30 * Math.PI) / 180,
    },
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
    if (basis === null) return err('invalid-result', 'A gear stands on an origin plane.');
    const { root } = gearCircles(params.teeth, params.module, params.pressureAngle);
    if (params.bore / 2 >= root) {
      return err('invalid-result', 'The bore is wider than the gear under its teeth.');
    }
    const outline = gearOutline(params.teeth, params.module, params.pressureAngle);
    const hole =
      params.bore > 0
        ? [[{ kind: 'circle' as const, center: { x: 0, y: 0 }, radius: params.bore / 2 }]]
        : [];
    const profile: Profile = {
      loops: [outline, ...hole],
      origin: basis.origin,
      normal: basis.normal,
      xDirection: basis.xDirection,
    };
    const created = await kernel.extrude(profile, params.width);
    if (!created.ok) return created;
    return combineWithBody(kernel, input.body, created.value, params.operation);
  },
});
