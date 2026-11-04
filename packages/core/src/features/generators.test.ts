/** Gear, spring and pipe against the real kernel: volumes from the formulas, and the refusals. */

import type { GeometryKernel, Profile, ShapeId } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import { gearFeature } from './gear.js';
import { gearCircles } from './gear-profile.js';
import { pipeFeature } from './pipe.js';
import { springFeature } from './spring.js';

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const ALPHA = (20 * Math.PI) / 180;
const gear = { teeth: 20, module: 2, width: 10, bore: 8, pressureAngle: ALPHA, plane: 'XY' };

const path = (segments: Profile['loops'][number]): Profile => ({
  loops: [segments],
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

describe('generators', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 60_000);

  const volume = async (shape: unknown) =>
    must(await kernel.massProperties(shape as ShapeId)).volume;
  const empty = { body: null } as never;
  const build = (feature: typeof gearFeature, params: object) =>
    feature.rebuild(kernel, { operation: 'new', ...params } as never, empty);

  it('a gear has the volume of its pitch circle, less the bore', async () => {
    const done = must(await build(gearFeature, gear));
    const { pitch } = gearCircles(20, 2, ALPHA);
    const expected = Math.PI * (pitch ** 2 - 4 ** 2) * 10;
    const made = await volume(done.body);
    expect(made).toBeGreaterThan(expected * 0.95);
    expect(made).toBeLessThan(expected * 1.05);
    const teeth = must(await kernel.subShapes(done.body as ShapeId, 'face')).length;
    expect(teeth).toBeGreaterThan(20 * 4);
  }, 60_000);

  it.each([
    [8, 1],
    [13, 0.5],
    [60, 1.5],
    [120, 0.8],
  ])(
    'builds %d teeth at module %d',
    async (teeth, module) => {
      const params = { ...gear, teeth, module, bore: 0 };
      const done = must(await build(gearFeature, params));
      expect(await volume(done.body)).toBeGreaterThan(0);
    },
    60_000,
  );

  it('turns a gear onto the plane asked for', async () => {
    const done = must(await build(gearFeature, { ...gear, plane: 'YZ' }));
    const box = must(await kernel.bounds(done.body as ShapeId));
    expect(box.max.x - box.min.x).toBeCloseTo(10, 3);
  }, 60_000);

  it('refuses a bore wider than the root', async () => {
    expect((await build(gearFeature, { ...gear, bore: 40 })).ok).toBe(false);
  }, 60_000);

  it('a spring has the volume of its wire', async () => {
    const params = { diameter: 20, wire: 2, pitch: 5, turns: 6, plane: 'XY' };
    const done = must(await build(springFeature as never, params));
    const length = 6 * Math.hypot(Math.PI * 20, 5);
    const expected = Math.PI * length;
    const made = await volume(done.body);
    expect(made).toBeGreaterThan(expected * 0.97);
    expect(made).toBeLessThan(expected * 1.03);
    const box = must(await kernel.bounds(done.body as ShapeId));
    expect(box.max.z - box.min.z).toBeCloseTo(32, 0);
  }, 60_000);

  it('refuses coils that run into each other', async () => {
    const params = { diameter: 20, wire: 6, pitch: 5, turns: 6, plane: 'XY' };
    expect((await build(springFeature as never, params)).ok).toBe(false);
  }, 60_000);

  const pipe = (route: Profile, params: object) =>
    pipeFeature.rebuild(
      kernel,
      { path: 'p', operation: 'new', ...params } as never,
      {
        body: null,
        path: () => route,
      } as never,
    );

  const elbow = path([
    { kind: 'line', start: { x: 0, y: 0 }, end: { x: 50, y: 0 } },
    { kind: 'arc', start: { x: 50, y: 0 }, mid: { x: 64.14, y: 5.86 }, end: { x: 70, y: 20 } },
    { kind: 'line', start: { x: 70, y: 20 }, end: { x: 70, y: 60 } },
  ]);

  it('a pipe is hollow, and its section stays round round a bend', async () => {
    const done = must(await pipe(elbow, { diameter: 12, wall: 2 }));
    const length = 50 + (Math.PI / 2) * 20 + 40;
    const expected = Math.PI * (6 ** 2 - 4 ** 2) * length;
    const made = await volume(done.body);
    expect(made).toBeGreaterThan(expected * 0.97);
    expect(made).toBeLessThan(expected * 1.03);
  }, 60_000);

  it('with no wall a pipe is a solid bar', async () => {
    const done = must(await pipe(elbow, { diameter: 12, wall: 0 }));
    const length = 50 + (Math.PI / 2) * 20 + 40;
    const made = await volume(done.body);
    expect(made).toBeGreaterThan(Math.PI * 36 * length * 0.97);
  }, 60_000);

  it('a pipe can start on an arc', async () => {
    const arc = path([
      { kind: 'arc', start: { x: 40, y: 0 }, mid: { x: 28.28, y: 28.28 }, end: { x: 0, y: 40 } },
    ]);
    const done = must(await pipe(arc, { diameter: 8, wall: 1 }));
    const expected = Math.PI * (16 - 9) * ((Math.PI / 2) * 40);
    const made = await volume(done.body);
    expect(made).toBeGreaterThan(expected * 0.97);
    expect(made).toBeLessThan(expected * 1.03);
  }, 60_000);

  it('refuses a wall with no bore left', async () => {
    expect((await pipe(elbow, { diameter: 12, wall: 6 })).ok).toBe(false);
  }, 60_000);
});
