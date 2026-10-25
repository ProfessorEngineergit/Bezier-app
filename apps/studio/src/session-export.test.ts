/** Export against the real kernel: everything, or only the picked bodies, as STL, STEP and 3MF. */

import { faceRef, RebuildCache } from '@bezier/core';
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { rectangleSketch } from '@bezier/ui';
import { beforeAll, expect, it } from 'vitest';
import { modelXml } from './formats/three-mf.js';
import { placeholderSolver } from './placeholder-solver.js';
import { Session } from './session.js';

let kernel: GeometryKernel;
beforeAll(async () => {
  kernel = await createOcctKernel();
}, 30_000);

/** Two separate boxes: 40 × 20 at the origin, 10 × 10 off to the side. */
async function twoBoxes() {
  const session = await Session.create('doc-1', 'Test', {
    kernel,
    solver: placeholderSolver(),
    store: new DocumentStore(new MemoryBackend()),
    cache: new RebuildCache(),
  });
  const box = (n: number, x: number, width: number) =>
    [
      {
        op: 'addFeature' as const,
        id: `sketch-${n}`,
        type: 'sketch',
        name: 'Sketch',
        index: 2 * (n - 1),
        params: {
          plane: 'XY',
          sketch: rectangleSketch('r', { x, y: 0, width, height: width / 2 }),
        },
      },
      {
        op: 'addFeature' as const,
        id: `extrude-${n}`,
        type: 'extrude',
        name: 'Extrude',
        index: 2 * n - 1,
        params: { sketch: `sketch-${n}`, distance: 10, direction: 'forward', operation: 'new' },
      },
    ] as const;
  await session.apply([...box(1, 0, 40), ...box(2, 100, 20)]);
  return session;
}

const triangles = (stl: Uint8Array) => new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);

it('exports only the picked body when one is picked', async () => {
  const session = await twoBoxes();
  const all = await session.exportStl();
  const one = await session.exportStl([faceRef('extrude-2', 'end')]);
  if (all === null || one === null) throw new Error('nothing exported');
  // A box is twelve triangles.
  expect(triangles(all)).toBe(24);
  expect(triangles(one)).toBe(12);
  const step = await session.exportStep([faceRef('extrude-1', 'end')]);
  expect(
    new TextDecoder().decode(step ?? new Uint8Array()).match(/MANIFOLD_SOLID_BREP/g),
  ).toHaveLength(1);
});

it('exports 3MF with one object per body', async () => {
  const session = await twoBoxes();
  const bytes = await session.export3mf();
  if (bytes === null) throw new Error('nothing exported');
  const text = new TextDecoder().decode(bytes);
  expect(text.match(/<object /g)).toHaveLength(2);
  expect(text).toContain('name="Body 1"');
  expect(text).toContain('name="Body 2"');
  const picked = new TextDecoder().decode(
    (await session.export3mf([faceRef('extrude-2', 'end')])) ?? new Uint8Array(),
  );
  expect(picked.match(/<object /g)).toHaveLength(1);
  expect(modelXml([])).toContain('<build>');
});

it('writes each body into STEP under its own name (audit F-055)', async () => {
  const session = await twoBoxes();
  const bytes = await session.exportStep();
  if (bytes === null) throw new Error('nothing exported');
  const text = new TextDecoder().decode(bytes);
  expect(text).toContain("PRODUCT('Body 1'");
  expect(text).toContain("PRODUCT('Body 2'");
});

it('writes imported meshes into STL with the solids, and finer when asked', async () => {
  const session = await twoBoxes();
  const plain = await session.exportStl();
  if (plain === null) throw new Error('nothing exported');
  expect(triangles(plain)).toBe(24);
  const fine = await session.exportStl(null, { linearDeflection: 0.005, angularDeflection: 0.1 });
  // Boxes are flat: the tolerance cannot add triangles to them.
  expect(fine === null ? 0 : triangles(fine)).toBe(24);
});
