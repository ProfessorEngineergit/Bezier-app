/**
 * A real thread on a round wall, a shaft or a hole: a 60° groove wound along the wall. It stays a
 * pitch short of each end, so it never cuts into what the wall stands on.
 *
 * OCCT's boolean on a helix is the operation here most likely to give a wrong answer without an
 * error (a fine pitch can leave nothing at all, or nothing cut), so the volume taken away is
 * compared with what such a groove takes, and anything else is refused.
 */

import type {
  CylindricalFace,
  GeometryKernel,
  KernelResult,
  Profile,
  ShapeId,
  ShapeWithHistory,
} from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { withinOwningSolids } from './bodies.js';
import { defineFeature } from './registry.js';

/** Depth of an ISO thread: external to the root, internal to the crest, in pitches. */
const EXTERNAL_DEPTH = 0.6134;
const INTERNAL_DEPTH = 0.5413;
/**
 * The groove's half width at the wall, in pitches, from the ISO 68 basic profile: the thread's own
 * flat is P/8 on the outside and P/4 in a hole.
 */
const EXTERNAL_MOUTH = 0.4375;
const INTERNAL_MOUTH = 0.375;
/** How far the groove's tool reaches past the wall, in pitches, so no face lies on the wall. */
const REACH = 0.3;
/** The tool's widest half, in pitches: turns must not run into each other. */
const HALF_WIDTH = 0.48;
const TAN_30 = Math.tan(Math.PI / 6);
/** How far the volume taken may be from the groove's, as a share of it. */
const TOLERANCE = 0.45;

/** The groove's section: how deep it goes, and half its width at the wall and at the bottom. */
function grooveSection(wall: CylindricalFace, pitch: number) {
  const depth = pitch * (wall.inward ? INTERNAL_DEPTH : EXTERNAL_DEPTH);
  const mouth = pitch * (wall.inward ? INTERNAL_MOUTH : EXTERNAL_MOUTH);
  return { depth, mouth, bottom: mouth - depth * TAN_30 };
}

/** The groove in the plane of the axis: x outward from the axis, y along it. */
function grooveProfile(wall: CylindricalFace, pitch: number): Profile {
  const { depth, mouth, bottom } = grooveSection(wall, pitch);
  // Outward for a hole, inward for a shaft: the way the groove goes into the material.
  const into = wall.inward ? 1 : -1;
  const tip = wall.radius + into * depth;
  const outer = wall.radius - into * pitch * REACH;
  const half = pitch * HALF_WIDTH;
  const shoulder = wall.radius - (into * (half - mouth)) / TAN_30;
  const start = pitch;
  const points = [
    { x: tip, y: start - bottom },
    { x: shoulder, y: start - half },
    { x: outer, y: start - half },
    { x: outer, y: start + half },
    { x: shoulder, y: start + half },
    { x: tip, y: start + bottom },
  ];
  return {
    loops: [
      points.map((from, index) => ({
        kind: 'line' as const,
        start: from,
        end: points[(index + 1) % points.length] ?? from,
      })),
    ],
    origin: wall.origin,
    normal: {
      x: wall.radial.y * wall.axis.z - wall.radial.z * wall.axis.y,
      y: wall.radial.z * wall.axis.x - wall.radial.x * wall.axis.z,
      z: wall.radial.x * wall.axis.y - wall.radial.y * wall.axis.x,
    },
    xDirection: wall.radial,
  };
}

/** The groove wound along a wall, ready to cut, with how many turns fit. */
export async function grooveTool(kernel: GeometryKernel, wall: CylindricalFace, pitch: number) {
  const turns = Math.floor(wall.height / pitch) - 2;
  if (turns < 1) return { ok: false as const, turns };
  const tool = await kernel.revolve(
    grooveProfile(wall, pitch),
    wall.origin,
    wall.axis,
    turns * 2 * Math.PI,
    pitch,
  );
  return tool.ok ? { ok: true as const, tool: tool.value, turns } : { ok: false as const, turns };
}

/** What one length of groove takes away: its section, about its centre, along the helix. */
export function grooveVolume(wall: CylindricalFace, pitch: number, turns: number): number {
  const { depth, mouth, bottom } = grooveSection(wall, pitch);
  const section = depth * (mouth + bottom);
  const centre = wall.radius + ((wall.inward ? 1 : -1) * depth) / 2;
  return section * 2 * Math.PI * centre * turns;
}

export async function volumeOf(kernel: GeometryKernel, shape: ShapeId): Promise<number | null> {
  const mass = await kernel.massProperties(shape);
  return mass.ok ? mass.value.volume : null;
}

export const threadFeature = defineFeature({
  type: 'thread',
  label: 'Thread',
  params: {
    faces: { kind: 'geometryRefs', label: 'Round wall', of: 'face' },
    pitch: { kind: 'length', label: 'Pitch', default: 1, min: 0.05 },
  },
  faceTags: ['thread-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There is nothing to thread yet.');
    const [ref] = params.faces;
    if (ref === undefined || params.faces.length !== 1) {
      return err('invalid-result', 'Select one round wall for the thread.');
    }
    const face = await input.resolve(ref);
    if (face === null) {
      return err('invalid-result', 'The wall of this thread no longer exists. Select it again.');
    }
    const found = await kernel.faceCylinder(face);
    if (!found.ok) return found;
    const wall = found.value;
    if (wall === null) return err('invalid-result', 'A thread needs a complete round wall.');

    const groove = await grooveTool(kernel, wall, params.pitch);
    if (!groove.ok) {
      return err('invalid-result', 'This wall is too short for a thread of this pitch.');
    }
    const { tool, turns } = groove;
    const refused: KernelResult<ShapeWithHistory> = err(
      'invalid-result',
      'This thread could not be cut cleanly. A coarser pitch or a wider wall usually can.',
    );
    try {
      return await withinOwningSolids(kernel, input.body, [face], async (solids) => {
        const before = await volumeOf(kernel, solids);
        const cut = await kernel.cut(solids, tool);
        if (!cut.ok) return refused;
        const after = await volumeOf(kernel, cut.value.shape);
        const expected = grooveVolume(wall, params.pitch, turns);
        const taken = before === null || after === null ? 0 : before - after;
        if (Math.abs(taken - expected) > expected * TOLERANCE) {
          await kernel.dispose(cut.value.shape);
          return refused;
        }
        return cut;
      });
    } finally {
      await kernel.dispose(tool);
    }
  },
});
