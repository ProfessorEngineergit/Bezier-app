/** A radius edit follows the selected exact wall and leaves neighbouring bodies alone. */
import { err } from '@bezier/kernel';
import { withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

export const cylinderRadiusFeature = defineFeature({
  type: 'cylinder-radius',
  label: 'Cylinder radius',
  params: {
    faces: { kind: 'geometryRefs', label: 'Cylindrical wall', of: 'face' },
    radius: { kind: 'length', label: 'Radius', default: 5, min: 0.001 },
  },
  faceTags: ['wall-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is no body to resize.');
    const [ref] = params.faces;
    if (!ref || params.faces.length !== 1)
      return err('invalid-result', 'Select one cylindrical wall.');
    const face = await input.resolve(ref);
    if (face === null)
      return err('invalid-result', 'The cylindrical wall no longer exists. Select it again.');
    return withinOwningSolids(kernel, input.body, [face], (body) =>
      kernel.resizeCylinder(body, face, params.radius),
    );
  },
});
