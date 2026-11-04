/**
 * A pipe along a sketched path: a round section carried along the path, hollow when it has a wall.
 * Sweeping wants one outline, so the bore is a second sweep, cut from the first.
 */

import type { Profile, ProfileSegment, Vec3 } from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

const scaled = (a: Vec3, by: number): Vec3 => ({ x: a.x * by, y: a.y * by, z: a.z * by });
const added = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const crossed = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Where a segment starts and which way it leaves, in the sketch's plane. */
function departure(segment: ProfileSegment) {
  if (segment.kind === 'line') {
    return {
      at: segment.start,
      way: { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y },
    };
  }
  if (segment.kind === 'spline') {
    const [first, second] = segment.poles;
    if (first === undefined || second === undefined) return null;
    return { at: first, way: { x: second.x - first.x, y: second.y - first.y } };
  }
  if (segment.kind === 'arc') {
    // Square to the radius, turned towards the arc's middle.
    const { start, mid, end } = segment;
    const d =
      2 * (start.x * (mid.y - end.y) + mid.x * (end.y - start.y) + end.x * (start.y - mid.y));
    if (Math.abs(d) < 1e-12) return null;
    const square = (p: { x: number; y: number }) => p.x * p.x + p.y * p.y;
    const cx =
      (square(start) * (mid.y - end.y) +
        square(mid) * (end.y - start.y) +
        square(end) * (start.y - mid.y)) /
      d;
    const cy =
      (square(start) * (end.x - mid.x) +
        square(mid) * (start.x - end.x) +
        square(end) * (mid.x - start.x)) /
      d;
    const across = { x: -(start.y - cy), y: start.x - cx };
    const forward = across.x * (mid.x - start.x) + across.y * (mid.y - start.y) >= 0 ? 1 : -1;
    return { at: start, way: { x: across.x * forward, y: across.y * forward } };
  }
  return null;
}

/** A round section square to the path where it starts. */
function sectionOf(path: Profile, radius: number): Profile | null {
  const first = path.loops[0]?.[0];
  if (first === undefined) return null;
  const leaving = departure(first);
  if (leaving === null) return null;
  const y = crossed(path.normal, path.xDirection);
  const inPlane = (p: { x: number; y: number }): Vec3 =>
    added(scaled(path.xDirection, p.x), scaled(y, p.y));
  const length = Math.hypot(leaving.way.x, leaving.way.y);
  if (length < 1e-9) return null;
  return {
    loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius }]],
    origin: added(path.origin, inPlane(leaving.at)),
    normal: scaled(inPlane(leaving.way), 1 / length),
    xDirection: path.normal,
  };
}

export const pipeFeature = defineFeature({
  type: 'pipe',
  label: 'Pipe',
  params: {
    path: { kind: 'featureRef', label: 'Path sketch' },
    diameter: { kind: 'length', label: 'Outer diameter', default: 12, min: 0.01 },
    wall: { kind: 'length', label: 'Wall', default: 2, min: 0 },
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
    const path = input.path?.(params.path) ?? null;
    if (path === null) return err('open-profile', 'The path sketch could not be found or solved.');
    if (typeof path === 'string') return err('open-profile', path);
    if (params.wall * 2 >= params.diameter && params.wall > 0) {
      return err('invalid-result', 'The wall leaves no bore: it is half the diameter or more.');
    }
    const outer = sectionOf(path, params.diameter / 2);
    if (outer === null) return err('open-profile', 'The pipe needs a path that starts somewhere.');
    const solid = await kernel.sweep(outer, path);
    if (!solid.ok) return solid;
    if (params.wall === 0)
      return combineWithBody(kernel, input.body, solid.value, params.operation);
    const inner = sectionOf(path, params.diameter / 2 - params.wall);
    const bore = inner === null ? null : await kernel.sweep(inner, path);
    if (bore === null || !bore.ok) {
      await kernel.dispose(solid.value);
      return err('invalid-result', 'The bore of this pipe could not be made.');
    }
    const hollow = await kernel.cut(solid.value, bore.value);
    await kernel.dispose(solid.value);
    await kernel.dispose(bore.value);
    if (!hollow.ok) return hollow;
    return combineWithBody(kernel, input.body, hollow.value.shape, params.operation);
  },
});
