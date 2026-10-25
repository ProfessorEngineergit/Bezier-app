/**
 * A local copy that lives only as long as the process. For tests and one-off scripts; the
 * app passes its real storage backend instead (repository.ts, `ObjectCache`).
 */

import type { ObjectCache } from './repository.ts';

export class MemoryCache implements ObjectCache {
  readonly entries = new Map<string, Uint8Array>();

  async read(key: string): Promise<Uint8Array | null> {
    return this.entries.get(key) ?? null;
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    this.entries.set(key, data.slice());
  }
}
