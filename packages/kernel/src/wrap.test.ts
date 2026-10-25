/** Wrapping a sketch round a cylinder, raised and cut, against the real kernel (audit F-051). */
import { beforeAll, expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';
import type { ShapeId } from './types.js';

function value<T>(r: KernelResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.message}: ${r.error.detail}`);
  return r.value;
}

let kernel: GeometryKernel;
let wall: ShapeId;

/** A 30 × 6 band on a plane 30 mm in front of the axis, square to it. */
const band: Profile = {
  loops: [
    [
      { kind: 'line', start: { x: -15, y: -3 }, end: { x: 15, y: -3 } },
      { kind: 'line', start: { x: 15, y: -3 }, end: { x: 15, y: 3 } },
      { kind: 'line', start: { x: 15, y: 3 }, end: { x: -15, y: 3 } },
      { kind: 'line', start: { x: -15, y: 3 }, end: { x: -15, y: -3 } },
    ],
  ],
  origin: { x: 0, y: -30, z: 20 },
  normal: { x: 0, y: -1, z: 0 },
  xDirection: { x: 1, y: 0, z: 0 },
};

beforeAll(async () => {
  kernel = await createOcctKernel();
  // A cylinder of radius 20, 40 high, round Z.
  const solid = value(
    await kernel.extrude(
      {
        loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 20 }]],
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xDirection: { x: 1, y: 0, z: 0 },
      },
      40,
    ),
  );
  const faces = value(await kernel.describeFaces(solid));
  for (const face of faces) {
    if (value(await kernel.faceCylinder(face.id)) !== null) wall = face.id;
  }
}, 120_000);

it('raises a band wrapped round the face, as long round it as it was across the plane', async () => {
  const tool = value(await kernel.wrapTool(wall, band, 1));
  const box = value(await kernel.bounds(tool));
  // 30 mm round a radius of 20 is 1.5 rad, so its ends stand at x = ±20·sin 0.75; cast straight
  // on, they would stand at ±15.
  expect(box.max.x).toBeCloseTo(20 * Math.sin(0.75), 1);
  expect(box.min.y).toBeCloseTo(-21, 1);
  // About the ring between R 20 and 21 over 1.5 rad and 6 mm: (21² − 20²) / 2 · 1.5 · 6 = 184.5.
  const { volume } = value(await kernel.massProperties(tool));
  expect(volume).toBeGreaterThan(170);
  expect(volume).toBeLessThan(200);
});

it('cuts the band into the face when the depth is negative', async () => {
  const tool = value(await kernel.wrapTool(wall, band, -1));
  // Between R 19 and 20: (20² − 19²) / 2 · 1.5 · 6, and nothing past the face.
  const mass = value(await kernel.massProperties(tool));
  expect(mass.volume).toBeGreaterThan(170);
  const box = value(await kernel.bounds(tool));
  expect(box.min.y).toBeGreaterThan(-20.01);
});
