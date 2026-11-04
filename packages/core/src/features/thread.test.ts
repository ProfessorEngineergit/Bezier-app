/** Threads against the real kernel: a shaft, a hole, and the refusal of what cannot be cut. */

import type { GeometryKernel, ShapeId } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import { metricSize, pitchFor, tapDrill } from './iso-metric.js';
import { threadFeature } from './thread.js';

const circle = (radius: number) => ({
  loops: [[{ kind: 'circle' as const, center: { x: 0, y: 0 }, radius }]],
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

const square = (half: number) => ({
  ...circle(1),
  loops: [
    [
      { kind: 'line' as const, start: { x: -half, y: -half }, end: { x: half, y: -half } },
      { kind: 'line' as const, start: { x: half, y: -half }, end: { x: half, y: half } },
      { kind: 'line' as const, start: { x: half, y: half }, end: { x: -half, y: half } },
      { kind: 'line' as const, start: { x: -half, y: half }, end: { x: -half, y: -half } },
    ],
  ],
});

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe('a thread on a round wall', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 120_000);

  async function wallOf(body: ShapeId): Promise<ShapeId> {
    for (const face of must(await kernel.subShapes(body, 'face'))) {
      if (must(await kernel.faceCylinder(face)) !== null) return face;
    }
    throw new Error('no round wall');
  }

  const cut = (body: ShapeId, wall: ShapeId, pitch: number) =>
    threadFeature.rebuild(kernel, { faces: [{ kind: 'face' } as never], pitch }, {
      body,
      resolve: async () => wall,
    } as never);

  it('cuts a shaft', async () => {
    const shaft = must(await kernel.extrude(circle(6), 20));
    const before = must(await kernel.massProperties(shaft)).volume;
    const done = must(await cut(shaft, await wallOf(shaft), 1.75));
    const after = must(await kernel.massProperties(done.body as ShapeId)).volume;
    expect(after).toBeLessThan(before * 0.95);
    expect(after).toBeGreaterThan(before * 0.7);
  }, 60_000);

  it('cuts a hole', async () => {
    const block = must(await kernel.extrude(square(20), 20));
    const bore = must(await kernel.extrude(circle(tapDrill(metricSize('M12') as never) / 2), 20));
    const holed = must(await kernel.cut(block, bore)).shape;
    const before = must(await kernel.massProperties(holed)).volume;
    const done = must(await cut(holed, await wallOf(holed), 1.75));
    expect(must(await kernel.massProperties(done.body as ShapeId)).volume).toBeLessThan(before);
  }, 60_000);

  it('refuses a wall too short for its pitch', async () => {
    const shaft = must(await kernel.extrude(circle(6), 3));
    const done = await cut(shaft, await wallOf(shaft), 1.75);
    expect(done.ok).toBe(false);
  }, 60_000);
});

describe('metric sizes', () => {
  it('finds the pitch from the wall', () => {
    expect(pitchFor(6, false)).toBe(1);
    expect(pitchFor(5, true)).toBe(1);
    expect(pitchFor(12, false)).toBe(1.75);
  });
});
