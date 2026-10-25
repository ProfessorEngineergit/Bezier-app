import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ShapeStore } from '@bezier/kernel';

/** A file-system `ShapeStore` that mirrors the app's OPFS store. */
export function directoryStore(directory: string): ShapeStore {
  mkdirSync(directory, { recursive: true });
  return {
    read: async (key) => {
      try {
        return new Uint8Array(readFileSync(join(directory, `${key}.bin`)));
      } catch {
        return null;
      }
    },
    write: async (key, parts) => writeFileSync(join(directory, `${key}.bin`), Buffer.concat(parts)),
  };
}
