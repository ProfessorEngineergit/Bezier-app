/** Outline points along a circle match the face mesh's polygon, not an independent sampling. */
import { expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import { createOcctKernel } from './occt-kernel.js';

function value<T>(r: KernelResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.message}: ${r.error.detail}`);
  return r.value;
}

it('draws a circular edge through the vertices of the mesh beside it', async () => {
  const kernel = await createOcctKernel();
  const cylinder = value(
    await kernel.extrude(
      {
        loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 10 }]],
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xDirection: { x: 1, y: 0, z: 0 },
      },
      20,
    ),
  );
  const options = { linearDeflection: 0.2, angularDeflection: 0.4 };
  const mesh = value(await kernel.tessellate(cylinder, options));
  const edges = value(await kernel.extractEdges(cylinder, options));

  // Every point of every line is a vertex of the mesh.
  const vertices = new Set<string>();
  const key = (p: ArrayLike<number>, i: number) =>
    `${p[i]?.toFixed(3)}|${p[i + 1]?.toFixed(3)}|${p[i + 2]?.toFixed(3)}`;
  for (let i = 0; i + 2 < mesh.positions.length; i += 3) vertices.add(key(mesh.positions, i));
  let apart = 0;
  for (let i = 0; i + 2 < edges.positions.length; i += 3) {
    if (!vertices.has(key(edges.positions, i))) apart += 1;
  }
  expect(apart).toBe(0);
});
