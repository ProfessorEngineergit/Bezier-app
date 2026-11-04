/** Boss, rib, snap fit, fit test, draft, lip and groove against the real kernel. */

import type { GeometryKernel, ShapeId } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import { bossFeature } from './boss.js';
import { draftFeature } from './draft.js';
import { fitTestFeature } from './fit-test.js';
import { lipFeature } from './lip.js';
import { ribFeature } from './rib.js';
import { snapFitFeature } from './snap-fit.js';

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const on = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
};

const square = (half: number) => {
  const corners = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
  return {
    ...on,
    loops: [
      corners.map((start, index) => ({
        kind: 'line' as const,
        start,
        end: corners[(index + 1) % 4] ?? start,
      })),
    ],
  };
};

describe('features for printed parts', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 60_000);

  const volume = async (shape: unknown) =>
    must(await kernel.massProperties(shape as ShapeId)).volume;
  const block = async () => must(await kernel.extrude(square(20), 10));
  /** The face whose outward normal points this way, highest first. */
  const faceFacing = async (body: ShapeId, z: number) => {
    for (const face of must(await kernel.subShapes(body, 'face'))) {
      const plane = await kernel.facePlane(face);
      if (plane.ok && Math.abs(plane.value.normal.z - z) < 1e-6) return face;
    }
    throw new Error('no such face');
  };
  const sideFaces = async (body: ShapeId) => {
    const sides = [];
    for (const face of must(await kernel.subShapes(body, 'face'))) {
      const plane = await kernel.facePlane(face);
      if (plane.ok && Math.abs(plane.value.normal.z) < 1e-6) sides.push(face);
    }
    return sides;
  };

  it('a boss adds a ring standing on the face, with its bore', async () => {
    const body = await block();
    const face = await faceFacing(body, 1);
    const done = must(
      await bossFeature.rebuild(
        kernel,
        { faces: [{}], x: 0, y: 0, diameter: 8, bore: 3, height: 10 } as never,
        { body, resolve: async () => face } as never,
      ),
    );
    const ring = Math.PI * (16 - 2.25) * 10;
    const made = (await volume(done.body)) - 40 * 40 * 10;
    expect(made).toBeCloseTo(ring, 0);
  }, 60_000);

  it('refuses a boss with no wall', async () => {
    const body = await block();
    const face = await faceFacing(body, 1);
    const done = await bossFeature.rebuild(
      kernel,
      { faces: [{}], x: 0, y: 0, diameter: 3, bore: 3, height: 10 } as never,
      { body, resolve: async () => face } as never,
    );
    expect(done.ok).toBe(false);
  }, 60_000);

  const route = (points: { x: number; y: number }[]) => ({
    ...on,
    loops: [
      points.slice(1).map((end, index) => ({
        kind: 'line' as const,
        start: points[index] ?? end,
        end,
      })),
    ],
  });

  it('a rib is a wall along its line, and turns corners', async () => {
    const path = route([
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 15 },
    ]);
    const done = must(
      await ribFeature.rebuild(
        kernel,
        { path: 'p', thickness: 2, height: 6 } as never,
        { body: null, path: () => path } as never,
      ),
    );
    const made = await volume(done.body);
    expect(made).toBeGreaterThan(2 * 6 * 33);
    expect(made).toBeLessThan(2 * 6 * 37);
  }, 60_000);

  it('a rib refuses a curve it cannot follow', async () => {
    const curved = {
      ...on,
      loops: [
        [
          {
            kind: 'arc' as const,
            start: { x: 0, y: 0 },
            mid: { x: 5, y: 5 },
            end: { x: 10, y: 0 },
          },
        ],
      ],
    };
    const done = await ribFeature.rebuild(
      kernel,
      { path: 'p', thickness: 2, height: 6 } as never,
      { body: null, path: () => curved } as never,
    );
    expect(done.ok).toBe(false);
  }, 60_000);

  const snap = { length: 16, thickness: 2, width: 6, overhang: 1, plane: 'XY', operation: 'new' };
  const snapBuild = (params: object) =>
    snapFitFeature.rebuild(kernel, { ...snap, ...params } as never, { body: null } as never);

  it('a snap fit is its arm and hook, across its width', async () => {
    const done = must(await snapBuild({}));
    const arm = 2 * 16 * 6;
    const made = await volume(done.body);
    expect(made).toBeGreaterThan(arm);
    expect(made).toBeLessThan(arm * 1.2);
    const box = must(await kernel.bounds(done.body as ShapeId));
    expect(box.max.x).toBeCloseTo(3, 3);
    expect(box.max.z).toBeCloseTo(6, 3);
  }, 60_000);

  it('a snap fit that would bend past what plastic takes says so', async () => {
    const done = await snapBuild({ length: 6, thickness: 3, overhang: 1.2 });
    expect(done.ok).toBe(false);
    if (!done.ok) expect(done.error.message).toContain('%');
  }, 60_000);

  it('a fit test has its holes growing by the step, and its peg', async () => {
    const params = { diameter: 8, step: 0.1, holes: 6, thickness: 4, plane: 'XY' };
    const done = must(
      await fitTestFeature.rebuild(kernel, params as never, { body: null } as never),
    );
    const holes = must(await kernel.subShapes(done.body as ShapeId, 'face'));
    let round = 0;
    const radii: number[] = [];
    for (const face of holes) {
      const wall = await kernel.faceCylinder(face);
      if (wall.ok && wall.value !== null) {
        round += 1;
        radii.push(wall.value.radius * 2);
      }
    }
    expect(round).toBe(7);
    const sorted = radii.sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(8, 3);
    expect(sorted[6]).toBeCloseTo(8.5, 3);
  }, 60_000);

  it('a draft leans the walls and takes material off the top', async () => {
    const body = await block();
    const sides = await sideFaces(body);
    expect(sides).toHaveLength(4);
    const done = must(
      await draftFeature.rebuild(
        kernel,
        { faces: sides.map(() => ({})), angle: (3 * Math.PI) / 180, plane: 'XY' } as never,
        {
          body,
          resolve: (() => {
            let index = 0;
            return async () => sides[index++];
          })(),
        } as never,
      ),
    );
    const made = await volume(done.body);
    expect(made).toBeLessThan(16000);
    expect(made).toBeGreaterThan(16000 * 0.85);
  }, 60_000);

  const tray = async () => {
    const solid = await block();
    const inner = must(await kernel.extrude({ ...square(18), origin: { x: 0, y: 0, z: 2 } }, 9));
    return must(await kernel.cut(solid, inner)).shape;
  };

  it('a lip stands on the inside of the rim', async () => {
    const body = await tray();
    const before = await volume(body);
    const rim = await faceFacing(body, 1);
    const done = must(
      await lipFeature.rebuild(
        kernel,
        { faces: [{}], style: 'lip', width: 1, height: 2, clearance: 0.2 } as never,
        { body, resolve: async () => rim } as never,
      ),
    );
    const band = (38 ** 2 - 36 ** 2) * 2;
    expect((await volume(done.body)) - before).toBeCloseTo(band, 0);
    const box = must(await kernel.bounds(done.body as ShapeId));
    expect(box.max.z).toBeCloseTo(12, 3);
  }, 60_000);

  it('a groove is the same band, cut in, wider and deeper by the clearance', async () => {
    const body = await tray();
    const before = await volume(body);
    const rim = await faceFacing(body, 1);
    const done = must(
      await lipFeature.rebuild(
        kernel,
        { faces: [{}], style: 'groove', width: 1, height: 2, clearance: 0.2 } as never,
        { body, resolve: async () => rim } as never,
      ),
    );
    const band = (38.4 ** 2 - 36 ** 2) * 2.2;
    expect(before - (await volume(done.body))).toBeCloseTo(band, 0);
  }, 60_000);
});
