/**
 * A coarser mesh after a finer one, against the real kernel. OCCT only remeshes for a finer
 * setting, so `tessellation.ts` meshes a copy; these pin fewer triangles and correct face names.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult, Mesh, ShapeId } from './index.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

const LOAD_TIMEOUT_MS = 120_000;
const FINE = { linearDeflection: 0.01, angularDeflection: 0.1 };
const COARSE = { linearDeflection: 1, angularDeflection: 1.2 };

function expectOk<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(`kernel refused: [${result.error.code}] ${result.error.message}`);
  return result.value;
}

function square(x0: number, y0: number, x1: number, y1: number): Profile {
  return {
    loops: [
      [
        { kind: 'line', start: { x: x0, y: y0 }, end: { x: x1, y: y0 } },
        { kind: 'line', start: { x: x1, y: y0 }, end: { x: x1, y: y1 } },
        { kind: 'line', start: { x: x1, y: y1 }, end: { x: x0, y: y1 } },
        { kind: 'line', start: { x: x0, y: y1 }, end: { x: x0, y: y0 } },
      ],
    ],
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
  };
}

/** Area-weighted centre of each face's triangles, by face position. */
function centres(mesh: Mesh, faces: number): { x: number; y: number; z: number }[] {
  const sums = Array.from({ length: faces }, () => ({ area: 0, x: 0, y: 0, z: 0 }));
  const at = (vertex: number, axis: number) => mesh.positions[vertex * 3 + axis] ?? 0;
  for (let t = 0; t < mesh.triangleFaces.length; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[t * 3 + k] ?? 0) as [
      number,
      number,
      number,
    ];
    const u = [0, 1, 2].map((axis) => at(b, axis) - at(a, axis)) as [number, number, number];
    const v = [0, 1, 2].map((axis) => at(c, axis) - at(a, axis)) as [number, number, number];
    const area =
      Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) /
      2;
    const sum = sums[mesh.triangleFaces[t] ?? -1];
    if (sum === undefined) throw new Error(`triangle ${t} names no face`);
    sum.area += area;
    sum.x += (area * (at(a, 0) + at(b, 0) + at(c, 0))) / 3;
    sum.y += (area * (at(a, 1) + at(b, 1) + at(c, 1))) / 3;
    sum.z += (area * (at(a, 2) + at(b, 2) + at(c, 2))) / 3;
  }
  return sums.map((sum) => {
    expect(sum.area).toBeGreaterThan(0);
    return { x: sum.x / sum.area, y: sum.y / sum.area, z: sum.z / sum.area };
  });
}

describe('a coarser mesh after a finer one', () => {
  let kernel: GeometryKernel;
  /** Two rings apart: round faces, where detail is what costs triangles. */
  let body: ShapeId;

  beforeAll(async () => {
    kernel = await createOcctKernel();
    const axis = { x: 0, y: 1, z: 0 };
    const near = expectOk(
      await kernel.revolve(square(10, 0, 20, 10), { x: 0, y: 0, z: 0 }, axis, 2 * Math.PI),
    );
    const far = expectOk(
      await kernel.revolve(square(10, 0, 20, 10), { x: 0, y: 0, z: 0 }, axis, 2 * Math.PI),
    );
    const moved = expectOk(await kernel.translate(far, { x: 100, y: 0, z: 0 }));
    body = expectOk(await kernel.compound(near, moved.shape)).shape;
  }, LOAD_TIMEOUT_MS);

  it('is actually coarser, with every triangle on the face it is named for', async () => {
    const faces = expectOk(await kernel.describeFaces(body)).length;
    const fine = expectOk(await kernel.tessellate(body, FINE));
    const coarse = expectOk(await kernel.tessellate(body, COARSE));

    expect(coarse.triangleFaces.length).toBeLessThan(fine.triangleFaces.length / 4);
    const want = centres(fine, faces);
    centres(coarse, faces).forEach((centre, index) => {
      const expected = want[index];
      // A coarse ring's chords pull its centre in a little; a mixed-up face would be off by
      // tens of millimetres.
      expect(
        Math.hypot(
          centre.x - (expected?.x ?? 0),
          centre.y - (expected?.y ?? 0),
          centre.z - (expected?.z ?? 0),
        ),
      ).toBeLessThan(2);
    });
  });

  it('goes back to full detail when asked again', async () => {
    const coarse = expectOk(await kernel.tessellate(body, COARSE));
    const fine = expectOk(await kernel.tessellate(body, FINE));
    expect(fine.triangleFaces.length).toBeGreaterThan(coarse.triangleFaces.length * 4);
  });
});

describe('a compound that holds more than solids', () => {
  it(
    'is meshed whole, so a loose face is drawn with the solids',
    async () => {
      const kernel = await createOcctKernel();
      const axis = { x: 0, y: 1, z: 0 };
      const ring = expectOk(
        await kernel.revolve(square(10, 0, 20, 10), { x: 0, y: 0, z: 0 }, axis, 2 * Math.PI),
      );
      const other = expectOk(
        await kernel.revolve(square(10, 0, 20, 10), { x: 0, y: 0, z: 0 }, axis, 2 * Math.PI),
      );
      const moved = expectOk(await kernel.translate(other, { x: 100, y: 0, z: 0 }));
      const [face] = expectOk(await kernel.subShapes(ring, 'face'));
      if (face === undefined) throw new Error('the ring has no faces');
      const loose = expectOk(await kernel.translate(face, { x: 0, y: 0, z: 100 }));
      const solids = expectOk(await kernel.compound(ring, moved.shape));
      const body = expectOk(await kernel.compound(solids.shape, loose.shape)).shape;

      const faces = expectOk(await kernel.describeFaces(body)).length;
      const mesh = expectOk(await kernel.tessellate(body, FINE));
      expect(new Set(mesh.triangleFaces).size).toBe(faces);
    },
    LOAD_TIMEOUT_MS,
  );
});

describe('solids that share a face', () => {
  it(
    'are described whole, in the order faceHashes lists them, each face once',
    async () => {
      const kernel = await createOcctKernel();
      // The same solid twice: every face is shared, the plainest case of what a split can
      // leave behind.
      const block = expectOk(await kernel.extrude(square(0, 0, 20, 10), 10));
      const twice = expectOk(await kernel.compound(block, block)).shape;
      const other = expectOk(await kernel.extrude(square(50, 0, 60, 10), 10));
      const body = expectOk(await kernel.compound(twice, other)).shape;

      const described = expectOk(await kernel.describeFaces(body)).map((face) => face.hash);
      expect(described).toEqual(expectOk(await kernel.faceHashes(body)));
      // And a mesh still covers every face.
      const mesh = expectOk(await kernel.tessellate(body, FINE));
      expect(new Set(mesh.triangleFaces).size).toBe(described.length);
    },
    LOAD_TIMEOUT_MS,
  );
});
