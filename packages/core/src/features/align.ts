/**
 * Align: rotates and moves a body so its face meets another body's face, centre to centre (audit
 * F-066). A history step, so the aligned part follows the target on later rebuilds.
 */

import { type EvolutionData, err, type FaceHash, type Vec3 } from '@bezier/kernel';
import { defineFeature } from './registry.js';
import { transformParts } from './transform-parts.js';

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

/** Axis and angle of the rotation taking unit vector `from` onto `to`. */
export function turnBetween(from: Vec3, to: Vec3): { axis: Vec3; angle: number } | null {
  const axis = cross(from, to);
  const sine = norm(axis);
  const cosine = dot(from, to);
  if (sine > 1e-9) return { axis, angle: Math.atan2(sine, cosine) };
  if (cosine > 0) return null;
  // Opposite: half a turn about any perpendicular axis.
  const helper = Math.abs(from.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  return { axis: cross(from, helper), angle: Math.PI };
}

/** Composes two evolutions applied in sequence. */
export function thenAfter(first: EvolutionData, second: EvolutionData): EvolutionData {
  const later = new Map<FaceHash, readonly FaceHash[]>();
  for (const hash of second.unchanged) later.set(hash, [hash]);
  for (const step of second.modified) later.set(step.from, step.to);
  for (const hash of second.deleted) later.set(hash, []);
  const through = (hash: FaceHash) => later.get(hash) ?? [hash];
  const unchanged: FaceHash[] = [];
  const modified: { from: FaceHash; to: readonly FaceHash[] }[] = [];
  const deleted: FaceHash[] = [...first.deleted];
  const carry = (from: FaceHash, to: readonly FaceHash[]) => {
    if (to.length === 0) deleted.push(from);
    else if (to.length === 1 && to[0] === from) unchanged.push(from);
    else modified.push({ from, to });
  };
  for (const hash of first.unchanged) carry(hash, through(hash));
  for (const step of first.modified) carry(step.from, step.to.flatMap(through));
  return {
    unchanged,
    modified,
    deleted,
    generated: [...first.generated.flatMap(through), ...second.generated],
  };
}

export const alignFeature = defineFeature({
  type: 'align',
  label: 'Align',
  params: {
    from: { kind: 'geometryRefs', label: 'Face to move', of: 'face', default: [] },
    to: { kind: 'geometryRefs', label: 'Against', of: 'face', default: [] },
    gap: { kind: 'length', label: 'Gap', default: 0 },
    // Faces pointing the same way (flush), not facing each other.
    flip: { kind: 'boolean', label: 'Same direction', default: false },
  },
  // Same faces, moved; none is new.
  faceTags: [],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is nothing to align yet.');
    const [fromRef] = params.from;
    const [toRef] = params.to;
    if (fromRef === undefined || toRef === undefined)
      return err(
        'invalid-result',
        'Pick a face of the part to move and the face to set it against.',
      );
    const [fromFace, toFace] = await Promise.all([input.resolve(fromRef), input.resolve(toRef)]);
    if (fromFace === null || toFace === null)
      return err('invalid-result', 'A face this step aligns no longer exists. Pick it again.');
    const [source, target] = await Promise.all([
      kernel.facePlane(fromFace),
      kernel.facePlane(toFace),
    ]);
    if (!source.ok)
      return err('invalid-result', 'Only flat faces can be aligned.', source.error.message);
    if (!target.ok)
      return err('invalid-result', 'Only flat faces can be aligned.', target.error.message);
    const n = target.value.normal;
    const facing = params.flip ? n : { x: -n.x, y: -n.y, z: -n.z };
    const turn = turnBetween(source.value.normal, facing);
    const at = source.value.origin;
    const goal = target.value.origin;
    const by = {
      x: goal.x + n.x * params.gap - at.x,
      y: goal.y + n.y * params.gap - at.y,
      z: goal.z + n.z * params.gap - at.z,
    };
    return transformParts(kernel, input, [fromRef], async (body) => {
      // Rotate about the face centre, then translate from there to the target.
      if (turn === null) return kernel.translate(body, by);
      const turned = await kernel.rotate(body, at, turn.axis, turn.angle);
      if (!turned.ok) return turned;
      try {
        const slid = await kernel.translate(turned.value.shape, by);
        if (!slid.ok) return slid;
        return {
          ok: true,
          value: {
            shape: slid.value.shape,
            evolution: thenAfter(turned.value.evolution, slid.value.evolution),
          },
        };
      } finally {
        await kernel.dispose(turned.value.shape);
      }
    });
  },
});
