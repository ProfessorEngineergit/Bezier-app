/**
 * Cache of imported shapes in the browser's private file system (OPFS), in the kernel worker so
 * shapes go from disk to OCCT without crossing to the page. Failures are silent: the kernel reads
 * the file itself when the store cannot help (`importStep` in `occt-kernel.ts`).
 */

/// <reference lib="dom" />

import type { ShapeStore } from '../shape-store.js';

const FOLDER = 'shapes';

/** Store size before the oldest entries are evicted. The Voron takes 123 MB; this holds a dozen. */
const LIMIT_BYTES = 1536 * 1024 * 1024;

/** The parts of the file-system API used here, named and not assumed. */
interface Folder {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, { kind: string }]>;
}

interface FileHandle {
  getFile(): Promise<File>;
  createWritable?: () => Promise<{
    write(data: Uint8Array<ArrayBuffer>): Promise<void>;
    close(): Promise<void>;
  }>;
  createSyncAccessHandle?: () => Promise<{
    truncate(size: number): void;
    write(data: Uint8Array<ArrayBuffer>, options: { at: number }): number;
    flush(): void;
    close(): void;
  }>;
}

async function folder(): Promise<Folder> {
  const root = await navigator.storage.getDirectory();
  return (await root.getDirectoryHandle(FOLDER, { create: true })) as unknown as Folder;
}

async function save(handle: FileHandle, parts: readonly Uint8Array<ArrayBuffer>[]): Promise<void> {
  if (handle.createWritable !== undefined) {
    const writable = await handle.createWritable();
    for (const part of parts) await writable.write(part);
    await writable.close();
    return;
  }
  // WebKit offers only the synchronous handle in workers. It is not atomic; the checksum in
  // front of every entry catches a torn write.
  if (handle.createSyncAccessHandle !== undefined) {
    const access = await handle.createSyncAccessHandle();
    try {
      access.truncate(0);
      let at = 0;
      for (const part of parts) at += access.write(part, { at });
      access.flush();
    } finally {
      access.close();
    }
  }
}

/** Remove the oldest entries until what is kept fits the limit. */
async function trim(shapes: Folder, keep: string): Promise<void> {
  const files: { name: string; size: number; modified: number }[] = [];
  for await (const [name, entry] of shapes.entries()) {
    if (entry.kind !== 'file') continue;
    const file = await (await shapes.getFileHandle(name)).getFile();
    files.push({ name, size: file.size, modified: file.lastModified });
  }
  let total = files.reduce((sum, file) => sum + file.size, 0);
  files.sort((a, b) => a.modified - b.modified);
  for (const file of files) {
    if (total <= LIMIT_BYTES) return;
    if (file.name === keep) continue;
    await shapes.removeEntry(file.name);
    total -= file.size;
  }
}

/** The store, or undefined where this browser has no private file system. */
export function opfsShapeStore(): ShapeStore | undefined {
  if (typeof navigator === 'undefined' || navigator.storage?.getDirectory === undefined) {
    return undefined;
  }
  return {
    async read(key) {
      try {
        const file = await (await (await folder()).getFileHandle(`${key}.bin`)).getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async write(key, parts) {
      const shapes = await folder();
      const name = `${key}.bin`;
      const owned = parts.map((part) =>
        part.buffer instanceof ArrayBuffer
          ? (part as Uint8Array<ArrayBuffer>)
          : new Uint8Array(part),
      );
      await save(await shapes.getFileHandle(name, { create: true }), owned);
      await trim(shapes, name);
    },
  };
}
