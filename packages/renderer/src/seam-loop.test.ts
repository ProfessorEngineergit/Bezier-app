/**
 * A round edge's seam segments must form a closed ring. Runs against the real kernel at several
 * fineness settings, since segment count and endpoints depend on them.
 */
import { createKernel, type KernelResult } from '@bezier/kernel';
import { expect, it } from 'vitest';
import { buildSeams, Welder } from './seams.js';

function value<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

it.each([
  { linearDeflection: 0.2, angularDeflection: 0.4 },
  { linearDeflection: 0.05, angularDeflection: 0.4 },
  { linearDeflection: 0.02, angularDeflection: 0.14 },
  { linearDeflection: 0.3, angularDeflection: 0.9 },
])('closes the ring where a cylinder meets its top at %o', async (options) => {
  const kernel = await createKernel({ inProcess: true });
  const body = value(
    await kernel.extrude(
      {
        loops: [[{ kind: 'circle', center: { x: 3, y: -2 }, radius: 17.3 }]],
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xDirection: { x: 1, y: 0, z: 0 },
      },
      12,
    ),
  );
  const mesh = value(await kernel.tessellate(body, options));
  const table = buildSeams(mesh);
  // The top and the bottom are the two flat faces; the wall is the one with the most triangles.
  const triangles = new Map<number, number>();
  for (const face of mesh.triangleFaces) triangles.set(face, (triangles.get(face) ?? 0) + 1);
  const wall = [...triangles].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;

  const ids = new Welder();
  const used = new Map<number, number>();
  let segments = 0;
  for (let seam = 0; seam < table.count; seam++) {
    const first = table.first[seam] ?? -1;
    const second = table.second[seam] ?? -1;
    if (table.more.has(seam) || (first !== wall && second !== wall) || first === second) continue;
    // Rims only: a seam at the height of the top face.
    const z0 = table.ends[seam * 6 + 2] ?? 0;
    const z1 = table.ends[seam * 6 + 5] ?? 0;
    if (Math.abs(z0 - 12) > 1e-3 || Math.abs(z1 - 12) > 1e-3) continue;
    segments += 1;
    for (const at of [0, 3]) {
      const id = ids.id(
        table.ends[seam * 6 + at] ?? 0,
        table.ends[seam * 6 + at + 1] ?? 0,
        table.ends[seam * 6 + at + 2] ?? 0,
      );
      used.set(id, (used.get(id) ?? 0) + 1);
    }
  }
  expect(segments).toBeGreaterThan(8);
  // A closed ring: every point is where exactly two segments meet.
  expect([...used.values()].every((count) => count === 2)).toBe(true);
  expect(used.size).toBe(segments);
});
