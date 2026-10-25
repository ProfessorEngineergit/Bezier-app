/**
 * Per-solid detail meshes against the real kernel: solid runs in the body mesh, face numbering
 * as in the body, and no change to what the next rebuild reuses.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult, ShapeId } from './index.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

const LOAD_TIMEOUT_MS = 120_000;
const BASE = { linearDeflection: 0.2, angularDeflection: 0.4 };
const FINER = { linearDeflection: 0.02, angularDeflection: 0.1 };
const COARSER = { linearDeflection: 1, angularDeflection: 1 };

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

describe('one solid of a body at its own detail', () => {
  let kernel: GeometryKernel;
  let body: ShapeId;

  beforeAll(async () => {
    kernel = await createOcctKernel();
    const axis = { x: 0, y: 1, z: 0 };
    const ring = () =>
      kernel.revolve(square(10, 0, 20, 10), { x: 0, y: 0, z: 0 }, axis, 2 * Math.PI);
    const near = expectOk(await ring());
    const far = expectOk(await kernel.translate(expectOk(await ring()), { x: 100, y: 0, z: 0 }));
    body = expectOk(await kernel.compound(near, far.shape)).shape;
  }, LOAD_TIMEOUT_MS);

  it('lies in one run of the body mesh per solid', async () => {
    const mesh = expectOk(await kernel.tessellate(body, BASE));
    expect([...(mesh.solidTriangles ?? [])]).toHaveLength(3);
    expect(mesh.solidTriangles?.[2]).toBe(mesh.triangleFaces.length);
    expect(mesh.solidVertices?.[2]).toBe(mesh.positions.length / 3);
  });

  it('comes finer, alone, with the faces numbered as in the body', async () => {
    const mesh = expectOk(await kernel.tessellate(body, BASE));
    const from = mesh.solidTriangles?.[1] ?? 0;
    const theirs = new Set(mesh.triangleFaces.subarray(from));
    const finer = expectOk(await kernel.tessellateSolids(body, [1], FINER));
    expect(finer.triangleFaces.length).toBeGreaterThan((mesh.triangleFaces.length - from) * 2);
    expect(new Set(finer.triangleFaces)).toEqual(theirs);
    // All of it is the far ring, a hundred millimetres along.
    for (let v = 0; v < finer.positions.length; v += 3) {
      expect(finer.positions[v]).toBeGreaterThan(75);
    }
  });

  it('leaves the body mesh as it was, finer or coarser', async () => {
    const before = expectOk(await kernel.tessellate(body, BASE)).triangleFaces.length;
    expectOk(await kernel.tessellateSolids(body, [0, 1], FINER));
    expectOk(await kernel.tessellateSolids(body, [0], COARSER));
    const after = expectOk(await kernel.tessellate(body, BASE)).triangleFaces.length;
    expect(after).toBe(before);
    const coarser = expectOk(await kernel.tessellateSolids(body, [0], COARSER));
    expect(coarser.triangleFaces.length).toBeLessThan(before / 2);
  });

  it('draws the outline of one solid, and refuses a solid the body lacks', async () => {
    const edges = expectOk(await kernel.extractSolidEdges(body, [1], FINER));
    expect([...(edges.solidLines ?? [])]).toEqual([0, edges.polylineStarts.length]);
    expect((await kernel.tessellateSolids(body, [5], FINER)).ok).toBe(false);
  });
});
