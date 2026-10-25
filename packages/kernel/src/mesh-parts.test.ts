/**
 * Meshing by helper workers (`mesh-parts.ts`) must match a single worker's mesh, triangle and face
 * alike. Two kernels with differing hashes stand in for two workers.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { GeometryKernel } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';
import type { ShapeId, TessellationOptions } from './types.js';
import { loadOcct } from './wasm.js';

const OPTIONS: TessellationOptions = { linearDeflection: 0.2, angularDeflection: 0.4 };

/** An assembly of a few different parts, read from STEP as an import is. */
async function assembly(kernel: GeometryKernel, step: string): Promise<ShapeId> {
  const read = await kernel.importStep(step);
  if (!read.ok) throw new Error(read.error.message);
  return read.value;
}

describe('meshing a large body in packets', () => {
  let step: string;

  beforeAll(async () => {
    const occt = await loadOcct();
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const kind = i % 3;
      const made =
        kind === 0
          ? occt.makeBox(10 + i, 12, 8)
          : kind === 1
            ? occt.makeCylinder(4 + i, 10)
            : occt.makeSphere(5 + i);
      parts.push(occt.translate(made, i * 40, 0, 0));
    }
    step = occt.exportStep(occt.makeCompound(parts));
  }, 120_000);

  it('comes out as the mesh one worker makes, face for face', async () => {
    const alone = await createOcctKernel();
    const reference = await alone.tessellate(await assembly(alone, step), OPTIONS);
    if (!reference.ok) throw new Error(reference.error.message);

    const reader = await createOcctKernel();
    const helper = await createOcctKernel();
    const shape = await assembly(reader, step);
    const packets = await reader.splitForMeshing(shape, 3);
    if (!packets.ok || packets.value === null) throw new Error('not split');
    expect(packets.value).toHaveLength(3);
    expect(packets.value.at(-1)?.end).toBe(6);
    for (const packet of packets.value) {
      const meshed = await helper.meshPacket(packet.brep, OPTIONS);
      if (!meshed.ok) throw new Error(meshed.error.message);
      const adopted = await reader.adoptMeshes(shape, { ...packet, ...meshed.value }, OPTIONS);
      expect(adopted).toEqual({ ok: true, value: true });
    }
    const mesh = await reader.tessellate(shape, OPTIONS);
    if (!mesh.ok) throw new Error(mesh.error.message);
    expect([...mesh.value.positions]).toEqual([...reference.value.positions]);
    expect([...mesh.value.indices]).toEqual([...reference.value.indices]);
    expect([...mesh.value.triangleFaces]).toEqual([...reference.value.triangleFaces]);

    const edges = await reader.extractEdges(shape, OPTIONS);
    const referenceEdges = await alone.extractEdges(await assembly(alone, step), OPTIONS);
    if (!edges.ok || !referenceEdges.ok) throw new Error('no outlines');
    expect(edges.value.positions.length).toBe(referenceEdges.value.positions.length);
  }, 120_000);

  it('turns down a packet that is not of this shape', async () => {
    const reader = await createOcctKernel();
    const helper = await createOcctKernel();
    const shape = await assembly(reader, step);
    const packets = await reader.splitForMeshing(shape, 3);
    if (!packets.ok || packets.value === null) throw new Error('not split');
    const [first, second] = packets.value;
    if (first === undefined || second === undefined) throw new Error('two packets');
    const meshed = await helper.meshPacket(first.brep, OPTIONS);
    if (!meshed.ok) throw new Error(meshed.error.message);
    // The first packet's meshes (a box and a cylinder) laid on the second's (a sphere and a box).
    const wrong = await reader.adoptMeshes(
      shape,
      { first: second.first, end: second.end, ...meshed.value },
      OPTIONS,
    );
    expect(wrong).toEqual({ ok: true, value: false });
  }, 120_000);
});
