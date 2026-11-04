/** A plain solid from its sizes, centred on the origin of a plane, without a sketch. */

import type { GeometryKernel, KernelResult, Profile, ProfilePoint, ShapeId } from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { type PlaneBasis, planeBasis } from '../rebuild/plane.js';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

export const SHAPES = ['box', 'cylinder', 'sphere', 'cone', 'torus'] as const;
type Shape = (typeof SHAPES)[number];

const profileOn = (basis: PlaneBasis, loops: Profile['loops']): Profile => ({
  loops,
  origin: basis.origin,
  normal: basis.normal,
  xDirection: basis.xDirection,
});

/** A section through the axis, turned once round it. */
function turned(kernel: GeometryKernel, basis: PlaneBasis, loop: Profile['loops'][number]) {
  return kernel.revolve(
    {
      loops: [loop],
      origin: basis.origin,
      normal: {
        x: -basis.yDirection.x,
        y: -basis.yDirection.y,
        z: -basis.yDirection.z,
      },
      xDirection: basis.xDirection,
    },
    basis.origin,
    basis.normal,
    2 * Math.PI,
  );
}

const lines = (points: readonly ProfilePoint[]) =>
  points.map((start, index) => ({
    kind: 'line' as const,
    start,
    end: points[(index + 1) % points.length] ?? start,
  }));

interface Sizes {
  width: number;
  depth: number;
  height: number;
  radius: number;
  top: number;
  tube: number;
}

function build(
  kernel: GeometryKernel,
  basis: PlaneBasis,
  shape: Shape,
  { width, depth, height, radius, top, tube }: Sizes,
): Promise<KernelResult<ShapeId>> {
  if (shape === 'box') {
    const [x, y] = [width / 2, depth / 2];
    const corners = [
      { x: -x, y: -y },
      { x, y: -y },
      { x, y },
      { x: -x, y },
    ];
    return kernel.extrude(profileOn(basis, [lines(corners)]), height);
  }
  if (shape === 'cylinder') {
    const circle = { kind: 'circle' as const, center: { x: 0, y: 0 }, radius };
    return kernel.extrude(profileOn(basis, [[circle]]), height);
  }
  if (shape === 'cone') {
    const ring: ProfilePoint[] = [
      { x: 0, y: 0 },
      { x: radius, y: 0 },
      { x: top, y: height },
      { x: 0, y: height },
    ];
    return turned(kernel, basis, lines(top > 0 ? ring : ring.filter((_, index) => index !== 2)));
  }
  if (shape === 'sphere') {
    return turned(kernel, basis, [
      {
        kind: 'arc',
        start: { x: 0, y: -radius },
        mid: { x: radius, y: 0 },
        end: { x: 0, y: radius },
      },
      { kind: 'line', start: { x: 0, y: radius }, end: { x: 0, y: -radius } },
    ]);
  }
  return turned(kernel, basis, [{ kind: 'circle', center: { x: radius, y: 0 }, radius: tube }]);
}

export const primitiveFeature = defineFeature({
  type: 'primitive',
  label: 'Solid',
  params: {
    shape: { kind: 'choice', label: 'Shape', options: SHAPES, default: 'box', fixed: true },
    width: { kind: 'length', label: 'Width', default: 40, min: 0.01, when: { shape: ['box'] } },
    depth: { kind: 'length', label: 'Depth', default: 20, min: 0.01, when: { shape: ['box'] } },
    radius: {
      kind: 'length',
      label: 'Radius',
      default: 15,
      min: 0.01,
      when: { shape: ['cylinder', 'sphere', 'cone', 'torus'] },
    },
    top: { kind: 'length', label: 'Top radius', default: 0, min: 0, when: { shape: ['cone'] } },
    tube: {
      kind: 'length',
      label: 'Tube radius',
      default: 4,
      min: 0.01,
      when: { shape: ['torus'] },
    },
    height: {
      kind: 'length',
      label: 'Height',
      default: 20,
      min: 0.01,
      when: { shape: ['box', 'cylinder', 'cone'] },
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
    if (basis === null) return err('invalid-result', 'A solid stands on an origin plane.');
    if (params.shape === 'torus' && params.tube >= params.radius) {
      return err(
        'invalid-result',
        'The tube is as thick as the ring is wide: nothing would be left of the hole.',
      );
    }
    if (params.shape === 'cone' && params.top === params.radius) {
      return err('invalid-result', 'With both radii the same this is a cylinder, not a cone.');
    }
    const made = await build(kernel, basis, params.shape as Shape, params);
    if (!made.ok) return made;
    return combineWithBody(kernel, input.body, made.value, params.operation);
  },
});
