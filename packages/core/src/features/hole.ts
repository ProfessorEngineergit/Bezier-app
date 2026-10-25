/**
 * Hole in a flat face: plain, counterbored or countersunk, blind or through. Positioned in the
 * face's sketch coordinates (`faceSketchBasis`) and cuts only the face's own part (ADR 0012).
 * The tool starts slightly above the face, because coplanar booleans are unreliable in OCCT.
 */

import type { GeometryKernel, KernelResult, Profile, ShapeId, Vec3 } from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { faceSketchBasis, type PlaneBasis } from '../rebuild/plane.js';
import { withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

const ABOVE = 0.01;

export const holeFeature = defineFeature({
  type: 'hole',
  label: 'Hole',
  params: {
    faces: { kind: 'geometryRefs', label: 'Face', of: 'face' },
    x: { kind: 'length', label: 'X', default: 0 },
    y: { kind: 'length', label: 'Y', default: 0 },
    diameter: { kind: 'length', label: 'Diameter', default: 5, min: 0.01 },
    through: { kind: 'boolean', label: 'Through all', default: false },
    depth: { kind: 'length', label: 'Depth', default: 10, min: 0.01, when: { through: [false] } },
    style: {
      kind: 'choice',
      label: 'Style',
      options: ['simple', 'counterbore', 'countersink'] as const,
      default: 'simple',
    },
    headDiameter: {
      kind: 'length',
      label: 'Head diameter',
      default: 9,
      min: 0.01,
      when: { style: ['counterbore', 'countersink'] },
    },
    headDepth: {
      kind: 'length',
      label: 'Head depth',
      default: 3,
      min: 0.01,
      when: { style: ['counterbore'] },
    },
    sinkAngle: {
      kind: 'angle',
      label: 'Countersink angle',
      default: 90,
      degrees: true,
      min: 1,
      max: 179,
      when: { style: ['countersink'] },
    },
  },
  faceTags: ['wall-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is no part to drill into.');
    const [ref] = params.faces;
    if (ref === undefined || params.faces.length !== 1) {
      return err('invalid-result', 'Select one flat face for the hole.');
    }
    const face = await input.resolve(ref);
    if (face === null) {
      return err('invalid-result', 'The face for this hole no longer exists. Select it again.');
    }
    const plane = await kernel.facePlane(face);
    if (!plane.ok) return err('invalid-result', 'A hole needs a flat face.', plane.error.detail);
    const basis = faceSketchBasis(plane.value.origin, plane.value.normal);
    if (params.style !== 'simple' && !(params.headDiameter > params.diameter)) {
      return err('invalid-result', 'The head of the hole must be wider than the hole.');
    }

    let depth = params.depth;
    if (params.through) {
      const bounds = await kernel.bounds(input.body);
      if (!bounds.ok) return bounds;
      const { min, max } = bounds.value;
      depth = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) * 2 + 1;
    }

    const centre = pointOn(basis, params.x, params.y, 0);
    const tools: ShapeId[] = [];
    try {
      const bore = await cylinder(kernel, basis, params.x, params.y, params.diameter / 2, depth);
      if (!bore.ok) return bore;
      tools.push(bore.value);
      if (params.style === 'counterbore') {
        const head = await cylinder(
          kernel,
          basis,
          params.x,
          params.y,
          params.headDiameter / 2,
          params.headDepth,
        );
        if (!head.ok) return head;
        tools.push(head.value);
      } else if (params.style === 'countersink') {
        const sink = await cone(
          kernel,
          basis,
          centre,
          params.headDiameter / 2,
          (params.sinkAngle * Math.PI) / 180,
        );
        if (!sink.ok) return sink;
        tools.push(sink.value);
      }

      let tool = tools[0] as ShapeId;
      for (const extra of tools.slice(1)) {
        const fused = await kernel.fuse(tool, extra);
        if (!fused.ok) return fused;
        tools.push(fused.value.shape);
        tool = fused.value.shape;
      }
      const drill = tool;
      return await withinOwningSolids(kernel, input.body, [face], (solids) =>
        kernel.cut(solids, drill),
      );
    } finally {
      for (const tool of tools) await kernel.dispose(tool);
    }
  },
});

function pointOn(basis: PlaneBasis, x: number, y: number, out: number): Vec3 {
  const { origin, xDirection: u, yDirection: v, normal: n } = basis;
  return {
    x: origin.x + u.x * x + v.x * y + n.x * out,
    y: origin.y + u.y * x + v.y * y + n.y * out,
    z: origin.z + u.z * x + v.z * y + n.z * out,
  };
}

/** A cylinder from just above the face into the part. */
function cylinder(
  kernel: GeometryKernel,
  basis: PlaneBasis,
  x: number,
  y: number,
  radius: number,
  depth: number,
): Promise<KernelResult<ShapeId>> {
  const profile: Profile = {
    loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius }]],
    origin: pointOn(basis, x, y, ABOVE),
    // Into the part, so a positive distance drills.
    normal: { x: -basis.normal.x, y: -basis.normal.y, z: -basis.normal.z },
    xDirection: basis.xDirection,
  };
  return kernel.extrude(profile, depth + ABOVE);
}

/** The countersink cone, revolved from a triangle in a plane through the hole's axis. */
function cone(
  kernel: GeometryKernel,
  basis: PlaneBasis,
  centre: Vec3,
  radius: number,
  angle: number,
): Promise<KernelResult<ShapeId>> {
  const height = radius / Math.tan(angle / 2);
  // Local x runs along the face; local y = normal × x points into the part.
  const lift = ABOVE;
  const top = radius + lift * Math.tan(angle / 2);
  const profile: Profile = {
    loops: [
      [
        { kind: 'line', start: { x: 0, y: -lift }, end: { x: top, y: -lift } },
        { kind: 'line', start: { x: top, y: -lift }, end: { x: 0, y: height } },
        { kind: 'line', start: { x: 0, y: height }, end: { x: 0, y: -lift } },
      ],
    ],
    origin: centre,
    normal: basis.yDirection,
    xDirection: basis.xDirection,
  };
  return kernel.revolve(profile, centre, basis.normal, 2 * Math.PI);
}
