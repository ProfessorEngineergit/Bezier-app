/**
 * A rib: a wall standing on a sketched line, for stiffness. Each straight piece of the path becomes
 * a slab of the rib's thickness, grown along the sketch's normal and joined to the part.
 */

import type { GeometryKernel, Profile, ProfilePoint } from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

function slab(path: Profile, a: ProfilePoint, b: ProfilePoint, half: number): Profile | null {
  const [du, dv] = [b.x - a.x, b.y - a.y];
  const length = Math.hypot(du, dv);
  if (length < 1e-9) return null;
  const [nu, nv] = [(-dv / length) * half, (du / length) * half];
  const corners = [
    { x: a.x + nu, y: a.y + nv },
    { x: b.x + nu, y: b.y + nv },
    { x: b.x - nu, y: b.y - nv },
    { x: a.x - nu, y: a.y - nv },
  ];
  return {
    ...path,
    loops: [
      corners.map((start, index) => ({
        kind: 'line' as const,
        start,
        end: corners[(index + 1) % corners.length] ?? start,
      })),
    ],
  };
}

async function slabs(kernel: GeometryKernel, path: Profile, half: number, height: number) {
  const made = [];
  for (const segment of path.loops[0] ?? []) {
    if (segment.kind !== 'line') return null;
    const profile = slab(path, segment.start, segment.end, half);
    if (profile === null) continue;
    const solid = await kernel.extrude(profile, height);
    if (!solid.ok) return null;
    made.push(solid.value);
  }
  return made;
}

export const ribFeature = defineFeature({
  type: 'rib',
  label: 'Rib',
  params: {
    path: { kind: 'featureRef', label: 'Path sketch' },
    thickness: { kind: 'length', label: 'Thickness', default: 2, min: 0.01 },
    height: { kind: 'length', label: 'Height', default: 10 },
  },
  faceTags: ['side-*', 'start', 'end'],
  async rebuild(kernel, params, input) {
    const path = input.path?.(params.path) ?? null;
    if (path === null) return err('open-profile', 'The rib sketch could not be found or solved.');
    if (typeof path === 'string') return err('open-profile', path);
    if (params.height === 0) return err('invalid-result', 'A rib needs a height.');
    const made = await slabs(kernel, path, params.thickness / 2, params.height);
    if (made === null || made.length === 0) {
      return err('open-profile', 'A rib follows straight lines. Draw it with the Line tool.');
    }
    let wall = made[0];
    for (const next of made.slice(1)) {
      if (wall === undefined) break;
      const joined = await kernel.fuse(wall, next);
      await kernel.dispose(wall);
      await kernel.dispose(next);
      if (!joined.ok) return joined;
      wall = joined.value.shape;
    }
    if (wall === undefined) return err('open-profile', 'This sketch has no line for a rib.');
    return combineWithBody(kernel, input.body, wall, input.body === null ? 'new' : 'add');
  },
});
