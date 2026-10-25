/** Rereading a file from the shape store, against the real kernel. */

import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';
import { keyOf, type ShapeStore } from './shape-store.js';

const LOAD_TIMEOUT_MS = 120_000;

function expectOk<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(`kernel refused: [${result.error.code}] ${result.error.message}`);
  return result.value;
}

/** A Map, counting what was asked of it. */
function memoryStore() {
  const entries = new Map<string, Uint8Array>();
  const counts = { reads: 0, writes: 0 };
  const store: ShapeStore = {
    read: async (key) => {
      counts.reads += 1;
      return entries.get(key) ?? null;
    },
    write: async (key, parts) => {
      counts.writes += 1;
      const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
      let at = 0;
      for (const part of parts) {
        whole.set(part, at);
        at += part.length;
      }
      entries.set(key, whole);
    },
  };
  return { store, entries, counts };
}

const square: Profile = {
  loops: [
    [
      { kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { kind: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
      { kind: 'line', start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
      { kind: 'line', start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
    ],
  ],
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
};

describe('a file read again from the store', () => {
  let file: string;

  beforeAll(async () => {
    const plain = await createOcctKernel();
    file = expectOk(await plain.exportStep(expectOk(await plain.extrude(square, 5))));
  }, LOAD_TIMEOUT_MS);

  const surfaces = async (kernel: GeometryKernel, reuse: boolean) => {
    const shape = expectOk(await kernel.importStep(file, { reuse }));
    return expectOk(await kernel.describeFaces(shape)).map((face) => face.surfaceType);
  };

  it('keeps the first read and reuses it, with the faces in the same order', async () => {
    const { store, counts } = memoryStore();
    const kernel = await createOcctKernel({ store });
    const first = await surfaces(kernel, true);
    // The shape, and its colours and part names, kept as none since the file has none.
    expect(counts.writes).toBe(3);
    const again = await surfaces(kernel, true);
    expect(counts.writes).toBe(3);
    expect(counts.reads).toBe(2);
    expect(again).toEqual(first);
  });

  it('reads the file itself when what was kept is damaged', async () => {
    const { store, entries, counts } = memoryStore();
    const kernel = await createOcctKernel({ store });
    const first = await surfaces(kernel, true);
    for (const [key, entry] of entries) {
      const damaged = entry.slice();
      damaged[damaged.length - 1] = (damaged[damaged.length - 1] ?? 0) ^ 0xff;
      entries.set(key, damaged);
    }
    expect(await surfaces(kernel, true)).toEqual(first);
    // Read from the file again, and kept again, colours and names and all.
    expect(counts.writes).toBe(6);
  });

  it('reads colours for a file kept before colours were, once', async () => {
    const { store, entries } = memoryStore();
    const kernel = await createOcctKernel({ store });
    await surfaces(kernel, true);
    const key = keyOf(file);
    for (const stored of [...entries.keys()]) if (stored !== key) entries.delete(stored);

    const later = await createOcctKernel({ store });
    expect(expectOk(await later.importColours(key))).toBeUndefined();
    expect(expectOk(await later.importColours(key, file))).toBeNull();
    // Known now, also to a kernel that starts afresh without the text.
    const fresh = await createOcctKernel({ store });
    expect(expectOk(await fresh.importColours(key))).toBeNull();
  });

  it('leaves the store alone unless asked to reuse', async () => {
    const { store, counts } = memoryStore();
    const kernel = await createOcctKernel({ store });
    await surfaces(kernel, false);
    expect(counts).toEqual({ reads: 0, writes: 0 });
  });
});
