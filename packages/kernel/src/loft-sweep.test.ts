/** Loft and Sweep against the real kernel (ADR 0017, audit F-032, F-033). */
import { beforeAll, expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

function value<T>(r: KernelResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.message}: ${r.error.detail}`);
  return r.value;
}

const square = (half: number, z: number): Profile => ({
  loops: [
    [
      { kind: 'line', start: { x: -half, y: -half }, end: { x: half, y: -half } },
      { kind: 'line', start: { x: half, y: -half }, end: { x: half, y: half } },
      { kind: 'line', start: { x: half, y: half }, end: { x: -half, y: half } },
      { kind: 'line', start: { x: -half, y: half }, end: { x: -half, y: -half } },
    ],
  ],
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

const circle = (radius: number, z: number): Profile => ({
  loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius }]],
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

let kernel: GeometryKernel;
beforeAll(async () => {
  kernel = await createOcctKernel();
}, 120_000);

it('lofts a ruled frustum between two squares', async () => {
  const solid = value(await kernel.loft([square(10, 0), square(5, 10)], true));
  // h/3 · (A1 + A2 + √(A1·A2)) = 10/3 · (400 + 100 + 200).
  expect(value(await kernel.massProperties(solid)).volume).toBeCloseTo(2333.33, 0);
});

it('lofts smoothly from a square to a circle', async () => {
  const solid = value(await kernel.loft([square(10, 0), circle(6, 20)]));
  const { volume } = value(await kernel.massProperties(solid));
  expect(volume).toBeGreaterThan(Math.PI * 36 * 20);
  expect(volume).toBeLessThan(400 * 20);
});

it('sweeps a circle along a bent path', async () => {
  // The profile stands across the path's start, which runs along +X.
  const profile: Profile = {
    loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 2 }]],
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 },
    xDirection: { x: 0, y: 1, z: 0 },
  };
  const path: Profile = {
    loops: [
      [
        { kind: 'line', start: { x: 0, y: 0 }, end: { x: 30, y: 0 } },
        { kind: 'arc', start: { x: 30, y: 0 }, mid: { x: 37.07, y: 2.93 }, end: { x: 40, y: 10 } },
        { kind: 'line', start: { x: 40, y: 10 }, end: { x: 40, y: 30 } },
      ],
    ],
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
  };
  const solid = value(await kernel.sweep(profile, path));
  // A tube of r 2 along 30 + quarter circle of r 10 + 20.
  const length = 30 + (Math.PI * 10) / 2 + 20;
  expect(value(await kernel.massProperties(solid)).volume).toBeCloseTo(Math.PI * 4 * length, -1);
});

it('says so for a loft of one section', async () => {
  const result = await kernel.loft([square(10, 0)]);
  expect(result.ok).toBe(false);
});
