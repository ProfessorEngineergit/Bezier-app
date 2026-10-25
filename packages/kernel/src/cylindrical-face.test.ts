/** Real B-Rep cylinders: radial edits preserve the body, its ends and the wall's provenance. */
import { expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { GeometryKernel } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';
import type { ShapeId, Vec3 } from './types.js';

function value<T>(r: KernelResult<T>): T {
  if (!r.ok) throw new Error(r.error.message + ': ' + r.error.detail);
  return r.value;
}
async function wall(kernel: GeometryKernel, body: ShapeId) {
  for (const face of value(await kernel.describeFaces(body))) {
    const cylinder = value(await kernel.faceCylinder(face.id));
    if (cylinder) return { face, cylinder };
  }
  throw new Error('Missing exact cylinder');
}

it.each([false, true])(
  'resizes a %s hole through 5 → 7 → 4 and preserves the wall history',
  async (blind) => {
    const kernel = await createOcctKernel();
    const base = value(
      await kernel.extrude(
        {
          loops: [
            [
              { kind: 'line', start: { x: -15, y: -15 }, end: { x: 15, y: -15 } },
              { kind: 'line', start: { x: 15, y: -15 }, end: { x: 15, y: 15 } },
              { kind: 'line', start: { x: 15, y: 15 }, end: { x: -15, y: 15 } },
              { kind: 'line', start: { x: -15, y: 15 }, end: { x: -15, y: -15 } },
            ],
          ],
          origin: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 0, z: 1 },
          xDirection: { x: 1, y: 0, z: 0 },
        },
        10,
      ),
    );
    const tool = value(
      await kernel.extrude(
        {
          loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 5 }]],
          origin: { x: 0, y: 0, z: blind ? 4 : -1 },
          normal: { x: 0, y: 0, z: 1 },
          xDirection: { x: 1, y: 0, z: 0 },
        },
        12,
      ),
    );
    const held = [base, tool];
    let body = value(await kernel.cut(base, tool)).shape;
    held.push(body);
    try {
      const originalBounds = value(await kernel.bounds(body));
      for (const radius of [7, 4, 5]) {
        const before = await wall(kernel, body);
        expect(before.cylinder.inward).toBe(true);
        const result = value(await kernel.resizeCylinder(body, before.face.id, radius));
        body = result.shape;
        held.push(body);
        const after = await wall(kernel, body);
        expect(after.cylinder.radius).toBeCloseTo(radius);
        expect(after.cylinder.height).toBeCloseTo(blind ? 6 : 10);
        expect(result.evolution.modified.find((e) => e.from === before.face.hash)?.to).toContain(
          after.face.hash,
        );
        expect(result.evolution.deleted).not.toContain(before.face.hash);
        expect(value(await kernel.bounds(body))).toEqual(originalBounds);
        expect(value(await kernel.exportStep(body))).toContain('MANIFOLD_SOLID_BREP');
      }
      const face = await wall(kernel, body);
      expect((await kernel.resizeCylinder(body, face.face.id, -1)).ok).toBe(false);
      expect((await kernel.resizeCylinder(body, face.face.id, 100)).ok).toBe(false);
    } finally {
      for (const shape of held) await kernel.dispose(shape);
    }
  },
  30_000,
);

it('recognises and resizes a cylinder along a rotated axis and permits returning to the original radius', async () => {
  const kernel = await createOcctKernel();
  const origin: Vec3 = { x: 12, y: -7, z: 3 };
  const body = value(
    await kernel.extrude(
      {
        loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 5 }]],
        origin,
        normal: { x: 1, y: 0, z: 0 },
        xDirection: { x: 0, y: 1, z: 0 },
      },
      10,
    ),
  );
  const before = await wall(kernel, body);
  expect(before.cylinder.inward).toBe(false);
  expect(Math.abs(before.cylinder.axis.x)).toBeCloseTo(1);
  const made = value(await kernel.resizeCylinder(body, before.face.id, 7));
  const after = await wall(kernel, made.shape);
  expect(after.cylinder.radius).toBeCloseTo(7);
  const restored = value(await kernel.resizeCylinder(made.shape, after.face.id, 5));
  expect((await wall(kernel, restored.shape)).cylinder.radius).toBeCloseTo(5);
  const unchanged = value(await kernel.resizeCylinder(body, before.face.id, 5));
  expect((await wall(kernel, unchanged.shape)).cylinder.radius).toBeCloseTo(5);
  for (const shape of [body, made.shape, restored.shape, unchanged.shape])
    await kernel.dispose(shape);
}, 30_000);

it('declines partial cylinders instead of editing their unselected circumference', async () => {
  const kernel = await createOcctKernel();
  const body = value(
    await kernel.revolve(
      {
        loops: [
          [
            { kind: 'line', start: { x: 5, y: 0 }, end: { x: 10, y: 0 } },
            { kind: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
            { kind: 'line', start: { x: 10, y: 10 }, end: { x: 5, y: 10 } },
            { kind: 'line', start: { x: 5, y: 10 }, end: { x: 5, y: 0 } },
          ],
        ],
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xDirection: { x: 1, y: 0, z: 0 },
      },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      Math.PI,
    ),
  );
  const faces = value(await kernel.describeFaces(body));
  const curved = faces.filter((f) => f.surfaceType === 'cylinder');
  expect(curved.length).toBeGreaterThan(0);
  for (const face of curved) {
    expect(value(await kernel.faceCylinder(face.id))).toBeNull();
    expect((await kernel.resizeCylinder(body, face.id, 7)).ok).toBe(false);
  }
  await kernel.dispose(body);
}, 30_000);
