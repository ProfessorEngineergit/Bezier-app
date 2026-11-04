/** A screw boss on a flat face: a round post with its bore, as a printed or moulded part has. */

import { err } from '@bezier/kernel';
import { faceSketchBasis, planeToWorld } from '../rebuild/plane.js';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

const circle = (radius: number) => [[{ kind: 'circle' as const, center: { x: 0, y: 0 }, radius }]];

export const bossFeature = defineFeature({
  type: 'boss',
  label: 'Boss',
  params: {
    faces: { kind: 'geometryRefs', label: 'Face', of: 'face', hidden: true },
    x: { more: true, kind: 'length', label: 'X', default: 0 },
    y: { more: true, kind: 'length', label: 'Y', default: 0 },
    diameter: { kind: 'length', label: 'Diameter', default: 8, min: 0.1 },
    bore: { kind: 'length', label: 'Bore', default: 3, min: 0 },
    height: { kind: 'length', label: 'Height', default: 10, min: 0.1 },
  },
  faceTags: ['side-*', 'end'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'A boss stands on a part.');
    const [ref] = params.faces;
    const face = ref === undefined ? null : await input.resolve(ref);
    if (face === null) {
      return err('invalid-result', 'The face of this boss no longer exists. Select it again.');
    }
    if (params.bore >= params.diameter) {
      return err('invalid-result', 'The bore is as wide as the boss: no wall would be left.');
    }
    const plane = await kernel.facePlane(face);
    if (!plane.ok) return err('invalid-result', 'A boss needs a flat face.');
    const basis = faceSketchBasis(plane.value.origin, plane.value.normal);
    const origin = planeToWorld(basis, params.x, params.y);
    const on = {
      origin,
      normal: basis.normal,
      xDirection: basis.xDirection,
    };
    const post = await kernel.extrude({ ...on, loops: circle(params.diameter / 2) }, params.height);
    if (!post.ok) return post;
    const joined = await combineWithBody(kernel, input.body, post.value, 'add');
    if (!joined.ok || params.bore === 0) return joined;
    // From just above the top down to the face the post stands on.
    const above = 0.01;
    const top = {
      ...on,
      origin: {
        x: origin.x + basis.normal.x * (params.height + above),
        y: origin.y + basis.normal.y * (params.height + above),
        z: origin.z + basis.normal.z * (params.height + above),
      },
    };
    const drill = await kernel.extrude(
      { ...top, loops: circle(params.bore / 2) },
      -(params.height + above),
    );
    if (!drill.ok) return drill;
    const cut = await combineWithBody(kernel, joined.value.body as never, drill.value, 'cut');
    if (!cut.ok) return cut;
    return { ok: true, value: { body: cut.value.body, evolution: joined.value.evolution } };
  },
});
