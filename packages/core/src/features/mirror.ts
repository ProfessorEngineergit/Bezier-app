/**
 * Mirror: reflects bodies in an offset origin plane or a face's plane. Adds the mirror beside the
 * original; with `keep` off the original is moved instead.
 */
import { err } from '@bezier/kernel';
import { planeBasis } from '../rebuild/plane.js';
import { defineFeature } from './registry.js';
import { transformParts } from './transform-parts.js';

export const mirrorFeature = defineFeature({
  type: 'mirror',
  label: 'Mirror',
  params: {
    faces: { kind: 'geometryRefs', label: 'Bodies', of: 'face', default: [] },
    plane: { kind: 'choice', label: 'Plane', options: ['YZ', 'XZ', 'XY'], default: 'YZ' },
    along: { kind: 'geometryRefs', label: 'In face', of: 'face', default: [] },
    offset: { kind: 'length', label: 'Offset', default: 0 },
    keep: { kind: 'boolean', label: 'Keep original', default: true },
  },
  faceTags: ['mirror-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'Select a body to mirror.');
    let point = { x: 0, y: 0, z: 0 };
    let normal = planeBasis(params.plane)?.normal ?? { x: 1, y: 0, z: 0 };
    const [faceRef] = params.along;
    if (faceRef !== undefined) {
      const face = await input.resolve(faceRef);
      if (face === null) return err('invalid-result', 'The mirror face no longer exists.');
      const plane = await kernel.facePlane(face);
      if (!plane.ok) return err('invalid-result', 'A body can only be mirrored in a flat face.');
      point = plane.value.origin;
      normal = plane.value.normal;
    }
    const at = {
      x: point.x + normal.x * params.offset,
      y: point.y + normal.y * params.offset,
      z: point.z + normal.z * params.offset,
    };
    return transformParts(
      kernel,
      input,
      params.faces,
      (body) => kernel.mirror(body, at, normal),
      params.keep,
    );
  },
});
