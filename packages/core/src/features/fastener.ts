/**
 * A standard screw, nut or washer from the parts gallery. It stands on the origin plane asked for,
 * or where `placement` puts it: at a point on a face, along the face's normal.
 */

import type {
  CylindricalFace,
  GeometryKernel,
  KernelResult,
  Profile,
  ProfilePoint,
  ShapeId,
  Vec3,
} from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { planeBasis } from '../rebuild/plane.js';
import { combineWithBody } from './bodies.js';
import {
  FASTENERS,
  type Fastener,
  fastenerExists,
  fastenerLengths,
  fastenerSizes,
  hexagon,
  hexChamfer,
  screwSection,
  sunkSizes,
  threadLength,
  washerSection,
} from './fastener-shape.js';
import { METRIC_SIZES, metricSize, tapDrill } from './iso-metric.js';
import { defineFeature } from './registry.js';
import { grooveTool, grooveVolume, volumeOf } from './thread.js';

const crossed = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const along = ({ origin, axis }: { origin: Vec3; axis: Vec3 }, by: number): Vec3 => ({
  x: origin.x + axis.x * by,
  y: origin.y + axis.y * by,
  z: origin.z + axis.z * by,
});

interface Frame {
  origin: Vec3;
  axis: Vec3;
  radial: Vec3;
}

function loopOf(points: readonly ProfilePoint[]) {
  return points.map((start, index) => ({
    kind: 'line' as const,
    start,
    end: points[(index + 1) % points.length] ?? start,
  }));
}

const turned = (kernel: GeometryKernel, frame: Frame, section: readonly ProfilePoint[]) =>
  kernel.revolve(
    {
      loops: [loopOf(section)],
      origin: frame.origin,
      normal: crossed(frame.radial, frame.axis),
      xDirection: frame.radial,
    },
    frame.origin,
    frame.axis,
    2 * Math.PI,
  );

/** A flat outline at height `at` along the axis, pushed `distance` further along it. */
function prism(
  kernel: GeometryKernel,
  frame: Frame,
  outline: Profile['loops'][number],
  at: number,
  distance: number,
) {
  const { axis } = frame;
  return kernel.extrude(
    {
      loops: [outline],
      origin: along(frame, at),
      normal: axis,
      xDirection: frame.radial,
    },
    distance,
  );
}

/** Applies `step` to two shapes and lets go of both. */
async function joined(
  kernel: GeometryKernel,
  a: ShapeId,
  b: ShapeId,
  step: 'fuse' | 'cut' | 'intersect',
): Promise<KernelResult<ShapeId>> {
  const made = await kernel[step](a, b);
  await kernel.dispose(a);
  await kernel.dispose(b);
  return made.ok ? { ok: true, value: made.value.shape } : made;
}

async function hexBody(
  kernel: GeometryKernel,
  frame: Frame,
  flats: number,
  height: number,
  both: boolean,
) {
  const raw = await prism(kernel, frame, loopOf(hexagon(flats)), 0, height);
  if (!raw.ok) return raw;
  const round = await turned(kernel, frame, hexChamfer(flats, height, both));
  if (!round.ok) return round;
  return joined(kernel, raw.value, round.value, 'intersect');
}

/** A real thread in a plain part: a screw's shank from its tip, or through a nut. */
async function threaded(
  kernel: GeometryKernel,
  frame: Frame,
  part: ShapeId,
  kind: Fastener,
  name: string,
  length: number,
): Promise<KernelResult<ShapeId>> {
  const size = metricSize(name);
  const sizes = fastenerSizes(name);
  if (size === undefined || sizes === undefined) return { ok: true, value: part };
  const nut = kind === 'hex-nut';
  // The groove starts a pitch along its wall: through a nut it has to start below it.
  const start = nut ? -size.pitch : -length;
  const { axis } = frame;
  const wall: CylindricalFace = {
    origin: along(frame, start),
    axis,
    radial: frame.radial,
    radius: nut ? tapDrill(size) / 2 : size.nominal / 2,
    height: nut ? sizes.nut + 2 * size.pitch : threadLength(kind, name, length),
    inward: nut,
  };
  const groove = await grooveTool(kernel, wall, size.pitch);
  if (!groove.ok) return err('invalid-result', 'This part is too short for its thread.');
  const before = await volumeOf(kernel, part);
  const cut = await joined(kernel, part, groove.tool, 'cut');
  if (!cut.ok) return cut;
  // A helical boolean can come back with nothing cut and no error: see `thread.ts`.
  const after = await volumeOf(kernel, cut.value);
  const expected = grooveVolume(wall, size.pitch, groove.turns);
  const taken = before === null || after === null ? 0 : before - after;
  if (Math.abs(taken - expected) > expected * 0.45) {
    await kernel.dispose(cut.value);
    return err('invalid-result', 'This thread could not be cut cleanly.');
  }
  return cut;
}

async function buildFastener(
  kernel: GeometryKernel,
  frame: Frame,
  kind: Fastener,
  name: string,
  length: number,
  thread: boolean,
): Promise<KernelResult<ShapeId>> {
  const size = metricSize(name);
  const sizes = fastenerSizes(name);
  if (size === undefined || sizes === undefined) {
    return err('invalid-result', 'That size is not in the table.');
  }
  if (kind === 'washer') return turned(kernel, frame, washerSection(name));
  if (kind === 'hex-nut') {
    const body = await hexBody(kernel, frame, sizes.flats, sizes.nut, true);
    if (!body.ok) return body;
    const bore = await prism(
      kernel,
      frame,
      [
        {
          kind: 'circle',
          center: { x: 0, y: 0 },
          radius: (thread ? tapDrill(size) : size.nominal) / 2,
        },
      ],
      -1,
      sizes.nut + 2,
    );
    if (!bore.ok) return bore;
    const nut = await joined(kernel, body.value, bore.value, 'cut');
    if (!nut.ok || !thread) return nut;
    return threaded(kernel, frame, nut.value, kind, name, length);
  }
  const shank = await turned(kernel, frame, screwSection(kind, name, length));
  if (!shank.ok) return shank;
  if (kind === 'hex-bolt') {
    const [, face] = sizes.face;
    const lifted = { ...frame, origin: along(frame, face) };
    const head = await hexBody(kernel, lifted, sizes.flats, sizes.boltHead - face, false);
    if (!head.ok) return head;
    const bolt = await joined(kernel, shank.value, head.value, 'fuse');
    if (!bolt.ok || !thread) return bolt;
    return threaded(kernel, frame, bolt.value, kind, name, length);
  }
  // The hex key's socket, sunk into the top of the head.
  const sunk = kind === 'countersunk' ? sunkSizes(name) : undefined;
  const top = kind === 'socket-head' ? size.capHeight : 0;
  const key = sunk?.key ?? sizes.key;
  const depth = sunk?.keyDepth ?? sizes.keyDepth;
  const socket = await prism(kernel, frame, loopOf(hexagon(key)), top - depth, depth + 1);
  if (!socket.ok) return socket;
  const screw = await joined(kernel, shank.value, socket.value, 'cut');
  if (!screw.ok || !thread) return screw;
  return threaded(kernel, frame, screw.value, kind, name, length);
}

/** Where a fastener was placed on a face: a point and the face's outward normal. */
export interface FastenerPlacement {
  origin: Vec3;
  normal: Vec3;
}

function frameOf(plane: string, placement: string): Frame | null {
  if (placement !== '') {
    let placed: FastenerPlacement;
    try {
      placed = JSON.parse(placement) as FastenerPlacement;
    } catch {
      return null;
    }
    const { origin, normal } = placed;
    const length = Math.hypot(normal.x, normal.y, normal.z);
    if (length < 1e-9) return null;
    const axis = { x: normal.x / length, y: normal.y / length, z: normal.z / length };
    const helper = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    const side = crossed(axis, helper);
    const size = Math.hypot(side.x, side.y, side.z);
    return {
      origin,
      axis,
      radial: { x: side.x / size, y: side.y / size, z: side.z / size },
    };
  }
  const basis = planeBasis(plane);
  return basis === null
    ? null
    : { origin: basis.origin, axis: basis.normal, radial: basis.xDirection };
}

export const fastenerFeature = defineFeature({
  type: 'fastener',
  label: 'Fastener',
  params: {
    kind: { kind: 'choice', label: 'Type', options: FASTENERS, default: 'socket-head' },
    size: {
      kind: 'choice',
      label: 'Size',
      options: METRIC_SIZES.map((size) => size.name),
      default: 'M5',
    },
    length: {
      kind: 'length',
      label: 'Length',
      default: 20,
      min: 1,
      when: { kind: ['socket-head', 'hex-bolt', 'countersunk'] },
    },
    /** Modelled, for printing it or for a close look. Drawn plain otherwise. */
    thread: { more: true, kind: 'boolean', label: 'Modelled thread', default: false },
    plane: {
      more: true,
      kind: 'choice',
      label: 'Plane',
      options: ['XY', 'XZ', 'YZ'],
      default: 'XY',
    },
    placement: { kind: 'text', label: 'Placement' },
  },
  faceTags: ['side-*'],
  async rebuild(kernel, params, input) {
    const frame = frameOf(params.plane, params.placement);
    if (frame === null) return err('invalid-result', 'This part has no place to stand.');
    const kind = params.kind as Fastener;
    if (!fastenerExists(kind, params.size)) {
      return err('invalid-result', `This standard has no ${params.size}.`);
    }
    const lengths = fastenerLengths(kind, params.size);
    if (lengths.length > 0 && !lengths.includes(params.length)) {
      return err(
        'invalid-result',
        `${params.size} comes in ${String(lengths[0])} to ${String(lengths.at(-1))} mm, in steps of the standard: ${lengths.join(', ')}.`,
      );
    }
    const made = await buildFastener(
      kernel,
      frame,
      kind,
      params.size,
      params.length,
      params.thread,
    );
    if (!made.ok) return made;
    return combineWithBody(kernel, input.body, made.value, 'new');
  },
});
