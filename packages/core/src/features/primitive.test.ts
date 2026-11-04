/** The plain solids against the real kernel: each one's volume from its formula. */

import type { GeometryKernel, ShapeId } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import { primitiveFeature } from './primitive.js';

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const sizes = {
  width: 40,
  depth: 20,
  height: 10,
  radius: 15,
  top: 0,
  tube: 4,
  plane: 'XY',
  operation: 'new',
};

describe('plain solids', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 60_000);
  const build = (shape: string, more: object = {}) =>
    primitiveFeature.rebuild(
      kernel,
      { ...sizes, shape, ...more } as never,
      { body: null } as never,
    );
  const volume = async (shape: string, more: object = {}) => {
    const done = must(await build(shape, more));
    return must(await kernel.massProperties(done.body as ShapeId)).volume;
  };

  it('a box', async () => expect(await volume('box')).toBeCloseTo(8000, 3), 30_000);
  it(
    'a cylinder',
    async () => expect(await volume('cylinder')).toBeCloseTo(Math.PI * 225 * 10, 1),
    30_000,
  );
  it(
    'a sphere',
    async () => expect(await volume('sphere')).toBeCloseTo((4 / 3) * Math.PI * 15 ** 3, 0),
    30_000,
  );
  it(
    'a cone',
    async () => expect(await volume('cone')).toBeCloseTo((Math.PI * 225 * 10) / 3, 1),
    30_000,
  );
  it(
    'a cone cut off',
    async () =>
      expect(await volume('cone', { top: 5 })).toBeCloseTo(
        (Math.PI * 10 * (225 + 15 * 5 + 25)) / 3,
        1,
      ),
    30_000,
  );
  it(
    'a torus',
    async () => expect(await volume('torus')).toBeCloseTo(2 * Math.PI ** 2 * 15 * 16, 0),
    30_000,
  );

  it('stands on the plane asked for', async () => {
    const done = must(await build('cylinder', { plane: 'XZ' }));
    const box = must(await kernel.bounds(done.body as ShapeId));
    expect(box.max.y - box.min.y).toBeCloseTo(10, 3);
  }, 30_000);

  it('refuses a torus with no hole', async () => {
    expect((await build('torus', { tube: 20 })).ok).toBe(false);
  }, 30_000);
});
