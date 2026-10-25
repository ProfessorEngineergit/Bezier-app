/**
 * Split: cuts a body in two along a plane (an origin plane or a face's plane, offset and tilted by
 * `tiltX` then `tiltY`). Both halves become bodies; split faces pass their name to both pieces.
 */
import type { Vec3 } from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { faceSketchBasis, type PlaneBasis, planeBasis } from '../rebuild/plane.js';
import { resolveFaces, withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

export const splitBodyFeature = defineFeature({
  type: 'split-body',
  label: 'Split',
  params: {
    faces: { kind: 'geometryRefs', label: 'Body', of: 'face' },
    plane: { kind: 'choice', label: 'Plane', options: ['XY', 'XZ', 'YZ'], default: 'XY' },
    /** A flat face to split along; empty uses `plane`. */
    along: { kind: 'geometryRefs', label: 'Along face', of: 'face', default: [] },
    offset: { kind: 'length', label: 'Offset', default: 0 },
    tiltX: { kind: 'angle', label: 'Tilt about X', default: 0, degrees: true },
    tiltY: { kind: 'angle', label: 'Tilt about Y', default: 0, degrees: true },
  },
  /** The new cut face on each half. */
  faceTags: ['cut-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is no body to split.');
    const faces = await resolveFaces(input, params.faces, 'body to split');
    if (!faces.ok) return faces;

    let basis: PlaneBasis | null = planeBasis(params.plane);
    const [alongRef] = params.along;
    if (alongRef !== undefined) {
      const face = await input.resolve(alongRef);
      if (face === null) {
        return err('invalid-result', 'The face to split along no longer exists. Select it again.');
      }
      const plane = await kernel.facePlane(face);
      if (!plane.ok) return err('invalid-result', 'Split can only follow a flat face.');
      // Use the face's own point so the plane passes through the face.
      basis = {
        ...faceSketchBasis(plane.value.origin, plane.value.normal),
        origin: plane.value.origin,
      };
    }
    if (basis === null) return err('invalid-result', 'Split needs a plane or a flat face.');

    const normal = tilted(basis, params.tiltX, params.tiltY);
    const origin = {
      x: basis.origin.x + basis.normal.x * params.offset,
      y: basis.origin.y + basis.normal.y * params.offset,
      z: basis.origin.z + basis.normal.z * params.offset,
    };
    return withinOwningSolids(kernel, input.body, faces.value, (solids) =>
      kernel.splitByPlane(solids, origin, normal),
    );
  },
});

/** The normal rotated `tiltX` degrees about the plane's X, then `tiltY` about its Y. */
function tilted(basis: PlaneBasis, tiltX: number, tiltY: number): Vec3 {
  const a = (tiltX * Math.PI) / 180;
  const b = (tiltY * Math.PI) / 180;
  // In the plane's own frame the normal is (0, 0, 1). About X: (0, -sin a, cos a).
  // Then about Y: (cos a · sin b, -sin a, cos a · cos b).
  const u = Math.cos(a) * Math.sin(b);
  const v = -Math.sin(a);
  const w = Math.cos(a) * Math.cos(b);
  const { xDirection: x, yDirection: y, normal: n } = basis;
  return {
    x: x.x * u + y.x * v + n.x * w,
    y: x.y * u + y.y * v + n.y * w,
    z: x.z * u + y.z * v + n.z * w,
  };
}
