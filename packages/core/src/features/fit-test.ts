/**
 * A fit test: a small plate with a row of holes around one size, and a peg of exactly that size to
 * try in them. Print it once and the hole that fits says what clearance this printer needs.
 */

import { err } from '@bezier/kernel';
import { planeBasis } from '../rebuild/plane.js';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

export const fitTestFeature = defineFeature({
  type: 'fit-test',
  label: 'Fit test',
  params: {
    diameter: { kind: 'length', label: 'Diameter', default: 8, min: 1 },
    step: { kind: 'length', label: 'Step', default: 0.1, min: 0.01 },
    holes: { kind: 'count', label: 'Holes', default: 6, min: 2 },
    thickness: { kind: 'length', label: 'Thickness', default: 4, min: 1 },
    plane: {
      more: true,
      kind: 'choice',
      label: 'Plane',
      options: ['XY', 'XZ', 'YZ'],
      default: 'XY',
    },
  },
  faceTags: ['side-*', 'start', 'end'],
  async rebuild(kernel, params, input) {
    const basis = planeBasis(params.plane);
    if (basis === null) return err('invalid-result', 'A fit test lies on an origin plane.');
    const { diameter, step, holes, thickness } = params;
    if (holes > 12)
      return err('invalid-result', 'Twelve holes are as many as a plate should hold.');
    const pitch = diameter + 2 * step * holes + 4;
    const width = pitch * holes;
    const height = pitch + diameter + 6;
    const circle = (x: number, y: number, radius: number) => [
      { kind: 'circle' as const, center: { x, y }, radius },
    ];
    const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
    const outline = corners.map((start, index) => ({
      kind: 'line' as const,
      start,
      end: corners[(index + 1) % corners.length] ?? start,
    }));
    const row = Array.from({ length: holes }, (_, index) =>
      circle(pitch * (index + 0.5), pitch / 2 + diameter + 6, (diameter + step * index) / 2),
    );
    const on = { origin: basis.origin, normal: basis.normal, xDirection: basis.xDirection };
    const plate = await kernel.extrude({ ...on, loops: [outline, ...row] }, thickness);
    if (!plate.ok) return plate;
    // The peg stands on the plate's corner strip, to be broken off and tried.
    const peg = await kernel.extrude(
      { ...on, loops: [circle(pitch / 2, (diameter + 6) / 2, diameter / 2)] },
      thickness * 3,
    );
    if (!peg.ok) return peg;
    const whole = await kernel.fuse(plate.value, peg.value);
    await kernel.dispose(plate.value);
    await kernel.dispose(peg.value);
    if (!whole.ok) return whole;
    return combineWithBody(kernel, input.body, whole.value.shape, 'new');
  },
});
