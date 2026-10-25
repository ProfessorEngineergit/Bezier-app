/**
 * Where a part meets a sketch's plane, at any angle: what a sketch brings in as external geometry.
 * Against the real kernel.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult } from './index.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

const LOAD_TIMEOUT_MS = 120_000;

function expectOk<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(`kernel refused: [${result.error.code}] ${result.error.message}`);
  return result.value;
}

const square: Profile = {
  loops: [
    [
      { kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { kind: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
      { kind: 'line', start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
      { kind: 'line', start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
    ],
  ],
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
};

describe('a part cut by a plane', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  it('gives the closed outline where a 45° plane crosses a cube', async () => {
    const cube = expectOk(await kernel.extrude(square, 10));
    const half = Math.SQRT1_2;
    const lines = expectOk(
      await kernel.sectionByPlane(cube, {
        origin: { x: 5, y: 5, z: 5 },
        normal: { x: 0, y: -half, z: half },
        xDirection: { x: 1, y: 0, z: 0 },
      }),
    );
    expect(lines).toHaveLength(4);
    // Every point of the cut lies on the plane.
    for (const line of lines)
      for (let i = 0; i < line.length; i += 3)
        expect(((line[i + 2] ?? 0) - 5) * half - ((line[i + 1] ?? 0) - 5) * half).toBeCloseTo(0);
  });

  it('gives nothing where the plane misses the part', async () => {
    const cube = expectOk(await kernel.extrude(square, 10));
    const lines = expectOk(
      await kernel.sectionByPlane(cube, {
        origin: { x: 0, y: 0, z: 50 },
        normal: { x: 0, y: 0, z: 1 },
        xDirection: { x: 1, y: 0, z: 0 },
      }),
    );
    expect(lines).toEqual([]);
  });
});
