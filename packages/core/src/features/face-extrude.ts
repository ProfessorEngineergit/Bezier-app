/**
 * Pushes or pulls a planar face. Pulling adds to the face's own body or makes a new body; pushing
 * cuts only that body, by a distance or through. Other bodies are never affected (ADR 0012).
 */
import { err } from '@bezier/kernel';
import { depthThrough, withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

export const faceExtrudeFeature = defineFeature({
  type: 'face-extrude',
  label: 'Extrude face',
  params: {
    faces: { kind: 'geometryRefs', label: 'Face', of: 'face' },
    distance: { kind: 'length', label: 'Distance', default: 5 },
    // Merge the new wall with the old one, without a seam. Off by default: older documents may
    // reference the `wall-*` faces that merging removes.
    merge: { kind: 'boolean', label: 'One wall, without a seam', default: false, hidden: true },
    // Pulling joins the body (default) or makes a new body.
    result: { kind: 'choice', label: 'Result', options: ['join', 'new'], default: 'join' },
    // Push by distance, or through the body (measured on each rebuild).
    extent: {
      kind: 'choice',
      label: 'Extent',
      options: ['distance', 'through'],
      default: 'distance',
    },
  },
  faceTags: ['wall-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is no body to extrude.');
    const [ref] = params.faces;
    if (ref === undefined || params.faces.length !== 1)
      return err('invalid-result', 'Select one flat face.');
    const face = await input.resolve(ref);
    if (face === null)
      return err('invalid-result', 'The selected face no longer exists. Select it again.');
    let distance = params.distance;
    if (params.extent === 'through' && distance < 0) {
      const plane = await kernel.facePlane(face);
      if (!plane.ok) return plane;
      const depth = await depthThrough(kernel, input.body, plane.value.origin, plane.value.normal);
      if (!depth.ok) return depth;
      distance = -depth.value;
    }
    const tool = await kernel.extrudeFace(face, distance);
    if (!tool.ok) return tool;
    if (params.result === 'new' && distance > 0) {
      // A separate body: the tool itself.
      const apart = await kernel.compound(input.body, tool.value);
      await kernel.dispose(tool.value);
      if (!apart.ok) return apart;
      return { ok: true, value: { body: apart.value.shape, evolution: apart.value.evolution } };
    }
    try {
      return await withinOwningSolids(kernel, input.body, [face], (solids) =>
        distance > 0
          ? kernel.fuse(solids, tool.value, { merge: params.merge })
          : kernel.cut(solids, tool.value),
      );
    } finally {
      await kernel.dispose(tool.value);
    }
  },
});
