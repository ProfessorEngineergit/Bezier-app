/**
 * A cantilever snap fit: an arm standing on a foot, with a hook at its end, drawn side on and pushed
 * out by its width. The hook rises by `overhang`, with a sloped lead-in and a square catch. Peak
 * strain on the arm's root is 1.5 · thickness · overhang / length²: a printed arm in PLA or ABS
 * stays below the usual 2 to 4 % with the default sizes.
 */

import { err } from '@bezier/kernel';
import { planeBasis } from '../rebuild/plane.js';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

export const snapFitFeature = defineFeature({
  type: 'snap-fit',
  label: 'Snap fit',
  params: {
    length: { kind: 'length', label: 'Length', default: 16, min: 1 },
    thickness: { kind: 'length', label: 'Thickness', default: 2, min: 0.2 },
    width: { kind: 'length', label: 'Width', default: 6, min: 0.2 },
    overhang: { kind: 'length', label: 'Overhang', default: 1, min: 0.1 },
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
      options: ['new', 'add'],
      default: 'new',
    },
  },
  faceTags: ['side-*', 'start', 'end'],
  async rebuild(kernel, params, input) {
    const basis = planeBasis(params.plane);
    if (basis === null) return err('invalid-result', 'A snap fit stands on an origin plane.');
    const { length, thickness: t, overhang: o, width } = params;
    const lead = o * 2.5;
    const catchHeight = Math.max(t * 0.75, o);
    if (lead + catchHeight >= length) {
      return err('invalid-result', 'The hook is longer than the arm it sits on.');
    }
    const strain = (1.5 * t * o) / length ** 2;
    if (strain > 0.06) {
      return err(
        'invalid-result',
        `This arm would bend ${(strain * 100).toFixed(1)} % at its root and break: make it longer or thinner.`,
      );
    }
    const points = [
      { x: 0, y: 0 },
      { x: t, y: 0 },
      { x: t, y: length - lead - catchHeight },
      { x: t + o, y: length - lead - catchHeight },
      { x: t + o, y: length - lead },
      { x: t, y: length },
      { x: 0, y: length },
    ];
    const made = await kernel.extrude(
      {
        loops: [
          points.map((start, index) => ({
            kind: 'line' as const,
            start,
            end: points[(index + 1) % points.length] ?? start,
          })),
        ],
        origin: basis.origin,
        normal: basis.normal,
        xDirection: basis.xDirection,
      },
      width,
    );
    if (!made.ok) return made;
    return combineWithBody(kernel, input.body, made.value, params.operation);
  },
});
