/** Stored meshes of an import, read back in a later session, against the real kernel. */

import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';
import type { ShapeStore } from './shape-store.js';

const LOAD_TIMEOUT_MS = 120_000;
const SETTING = { linearDeflection: 0.1, angularDeflection: 0.5 };

function expectOk<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(`kernel refused: [${result.error.code}] ${result.error.message}`);
  return result.value;
}

function square(x: number): Profile {
  return {
    loops: [
      [
        { kind: 'line', start: { x, y: 0 }, end: { x: x + 10, y: 0 } },
        { kind: 'line', start: { x: x + 10, y: 0 }, end: { x: x + 10, y: 10 } },
        { kind: 'line', start: { x: x + 10, y: 10 }, end: { x, y: 10 } },
        { kind: 'line', start: { x, y: 10 }, end: { x, y: 0 } },
      ],
    ],
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
  };
}

function memoryStore() {
  const entries = new Map<string, Uint8Array>();
  const found: string[] = [];
  const store: ShapeStore = {
    read: async (key) => {
      const entry = entries.get(key) ?? null;
      if (entry !== null) found.push(key);
      return entry;
    },
    write: async (key, parts) => {
      const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
      let at = 0;
      for (const part of parts) {
        whole.set(part, at);
        at += part.length;
      }
      entries.set(key, whole);
    },
  };
  return { store, entries, found };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(done()).toBe(true);
}

describe('the display of an import, kept for the next session', {
  timeout: LOAD_TIMEOUT_MS,
}, () => {
  let file: string;

  beforeAll(async () => {
    const plain = await createOcctKernel();
    // Three solids, so the body is meshed solid by solid (the path that keeps what it made),
    // and one of them round, so its faces have shape.
    const a = expectOk(await plain.extrude(square(0), 5));
    const b = expectOk(await plain.extrude(square(30), 5));
    const c = expectOk(
      await plain.revolve(square(60), { x: 60, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 2 * Math.PI),
    );
    const ab = expectOk(await plain.compound(a, b));
    file = expectOk(await plain.exportStep(expectOk(await plain.compound(ab.shape, c)).shape));
  }, LOAD_TIMEOUT_MS);

  it('is written once meshed, and read back as the same triangles on the same faces', async () => {
    const { store, entries, found } = memoryStore();

    const first = await createOcctKernel({ store });
    const shape = expectOk(await first.importStep(file, { reuse: true }));
    const mesh = expectOk(await first.tessellate(shape, SETTING));
    const edges = expectOk(await first.extractEdges(shape, SETTING));
    await until(() => [...entries.keys()].filter((key) => key.includes('display-2')).length === 2);

    const later = await createOcctKernel({ store });
    const again = expectOk(await later.importStep(file, { reuse: true }));
    const kept = expectOk(await later.tessellate(again, SETTING));
    const keptEdges = expectOk(await later.extractEdges(again, SETTING));

    expect(found.some((key) => key.includes('display-2-mesh'))).toBe(true);
    expect(found.some((key) => key.includes('display-2-edges-mesh'))).toBe(true);
    expect(kept.positions).toEqual(mesh.positions);
    expect(kept.indices).toEqual(mesh.indices);
    // Faces named by position in the new session's own description.
    expect(kept.triangleFaces).toEqual(mesh.triangleFaces);
    expect(keptEdges.positions).toEqual(edges.positions);
  });

  it('is left alone when it belongs to some other shape', async () => {
    const { store, entries } = memoryStore();
    const first = await createOcctKernel({ store });
    const shape = expectOk(await first.importStep(file, { reuse: true }));
    const mesh = expectOk(await first.tessellate(shape, SETTING));
    await until(() => [...entries.keys()].some((key) => key.includes('display-2-mesh')));
    // Damage the kept meshes: the checksum turns them away and the body is meshed as if
    // nothing had been kept.
    for (const [key, entry] of entries) {
      const last = entry.length - 1;
      if (key.includes('display-2-mesh')) entry[last] = (entry[last] ?? 0) ^ 0xff;
    }

    const later = await createOcctKernel({ store });
    const again = expectOk(await later.importStep(file, { reuse: true }));
    const meshed = expectOk(await later.tessellate(again, SETTING));
    expect(meshed.triangleFaces).toEqual(mesh.triangleFaces);
  });
});
