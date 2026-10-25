/** In-memory backend for tests, with injectable write failures, corruption and truncation. */

import type { StorageBackend } from './backend.js';

export class MemoryBackend implements StorageBackend {
  readonly #files = new Map<string, Uint8Array>();

  /** Number of upcoming writes that throw, simulating a crash. */
  failNextWrites = 0;

  /** Completed writes, to assert that an append did not rewrite the whole file. */
  writeCount = 0;
  appendCount = 0;

  #maybeFail(): void {
    if (this.failNextWrites > 0) {
      this.failNextWrites--;
      throw new Error('simulated storage failure');
    }
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    this.#maybeFail();
    // Copy so a caller reusing its buffer cannot change stored data.
    this.#files.set(key, new Uint8Array(data));
    this.writeCount++;
  }

  async append(key: string, data: Uint8Array): Promise<void> {
    this.#maybeFail();
    const existing = this.#files.get(key);
    if (existing === undefined) {
      this.#files.set(key, new Uint8Array(data));
    } else {
      const combined = new Uint8Array(existing.length + data.length);
      combined.set(existing);
      combined.set(data, existing.length);
      this.#files.set(key, combined);
    }
    this.appendCount++;
  }

  async read(key: string): Promise<Uint8Array | null> {
    const found = this.#files.get(key);
    return found === undefined ? null : new Uint8Array(found);
  }

  async list(prefix: string): Promise<readonly string[]> {
    return [...this.#files.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async remove(key: string): Promise<void> {
    this.#files.delete(key);
  }

  // Test helpers.

  /** Flips a stored byte, to exercise the checksum path. */
  corrupt(key: string, offset: number): void {
    const data = this.#files.get(key);
    if (data === undefined || offset >= data.length) return;
    data[offset] = (data[offset] ?? 0) ^ 0xff;
  }

  /** Truncates a file, as a torn write would. */
  truncate(key: string, length: number): void {
    const data = this.#files.get(key);
    if (data === undefined) return;
    this.#files.set(key, data.slice(0, length));
  }

  size(key: string): number {
    return this.#files.get(key)?.length ?? 0;
  }
}
