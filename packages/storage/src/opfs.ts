/**
 * Browser backend over the Origin Private File System. Covered by the e2e suite only. OPFS is
 * tied to the browser profile, so clearing site data deletes every document (ADR 0005, 0006).
 */

import type { StorageBackend } from './backend.js';

/** `move()` makes writes atomic but is missing from some TypeScript DOM libs. */
interface MovableFileHandle extends FileSystemFileHandle {
  move?: (destination: FileSystemDirectoryHandle, name: string) => Promise<void>;
}

/**
 * Returns an `ArrayBuffer`-backed view, copying only if needed. The filesystem API refuses
 * `SharedArrayBuffer`, which appears once threads are on (docs/kernel.md).
 */
function asWritable(data: Uint8Array): Uint8Array<ArrayBuffer> {
  if (data.buffer instanceof ArrayBuffer) {
    return data as Uint8Array<ArrayBuffer>;
  }
  const copy = new Uint8Array(data.length);
  copy.set(data);
  return copy;
}

/** Tells concurrent writes to the same key apart. Only uniqueness matters. */
function uniqueSuffix(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class OpfsBackend implements StorageBackend {
  #root: FileSystemDirectoryHandle | null = null;

  /**
   * Serializes writes per key. OPFS locks the destination during `move()`, so two concurrent
   * writes to one key fail with "cannot be moved to a destination which is locked".
   */
  #writeQueues = new Map<string, Promise<void>>();

  async #directory(): Promise<FileSystemDirectoryHandle> {
    if (this.#root === null) {
      this.#root = await navigator.storage.getDirectory();
    }
    return this.#root;
  }

  /** Walks, and optionally creates, the directories in an `a/b/c.json` key. */
  async #resolve(
    key: string,
    create: boolean,
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string } | null> {
    const parts = key.split('/');
    const name = parts.pop();
    if (name === undefined) return null;

    let directory = await this.#directory();
    for (const part of parts) {
      try {
        directory = await directory.getDirectoryHandle(part, { create });
      } catch {
        return null;
      }
    }
    return { parent: directory, name };
  }

  /** Queues the write behind any other write to the same key. */
  async write(key: string, data: Uint8Array): Promise<void> {
    const queued = (this.#writeQueues.get(key) ?? Promise.resolve()).then(() =>
      this.#writeNow(key, data),
    );
    // The queue swallows rejections so one failure does not block later writes; `queued`
    // still rejects for this caller.
    const settled = queued.catch(() => undefined);
    this.#writeQueues.set(key, settled);
    void settled.then(() => {
      if (this.#writeQueues.get(key) === settled) this.#writeQueues.delete(key);
    });
    return queued;
  }

  /**
   * Writes to a temporary file and moves it into place, so a crash leaves the previous version
   * (ADR 0009). Without `move()` it falls back to a non-atomic direct write.
   */
  async #writeNow(key: string, data: Uint8Array): Promise<void> {
    const resolved = await this.#resolve(key, true);
    if (resolved === null) throw new Error(`cannot resolve storage key: ${key}`);

    // Unique per write: overlapping writes from another tab would otherwise share one locked
    // temporary handle.
    const temporary = `${resolved.name}.${uniqueSuffix()}.tmp`;
    const handle = (await resolved.parent.getFileHandle(temporary, {
      create: true,
    })) as MovableFileHandle;

    const writable = await handle.createWritable();
    await writable.write(asWritable(data));
    await writable.close();

    try {
      if (typeof handle.move === 'function') {
        await handle.move(resolved.parent, resolved.name);
        return;
      }

      // Fallback: copy across, then drop the temporary. Not atomic.
      const target = await resolved.parent.getFileHandle(resolved.name, { create: true });
      const direct = await target.createWritable();
      await direct.write(asWritable(data));
      await direct.close();
    } finally {
      // A move consumes the temporary; otherwise remove it so orphans do not fill the quota.
      await resolved.parent.removeEntry(temporary).catch(() => undefined);
    }
  }

  /**
   * Appends with `keepExistingData` and a seek to the end. Browsers still copy the file
   * internally; see journal-file.ts for how large entries avoid that.
   */
  async append(key: string, data: Uint8Array): Promise<void> {
    const resolved = await this.#resolve(key, true);
    if (resolved === null) throw new Error(`cannot resolve storage key: ${key}`);

    const handle = await resolved.parent.getFileHandle(resolved.name, { create: true });
    const existing = (await handle.getFile()).size;

    const writable = await handle.createWritable({ keepExistingData: true });
    await writable.seek(existing);
    await writable.write(asWritable(data));
    await writable.close();
  }

  async read(key: string): Promise<Uint8Array | null> {
    const resolved = await this.#resolve(key, false);
    if (resolved === null) return null;

    try {
      const handle = await resolved.parent.getFileHandle(resolved.name);
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      // Missing is normal, e.g. a document with no journal yet.
      return null;
    }
  }

  async list(prefix: string): Promise<readonly string[]> {
    const found: string[] = [];
    await this.#walk(await this.#directory(), '', found);
    return found.filter((key) => key.startsWith(prefix)).sort();
  }

  async #walk(directory: FileSystemDirectoryHandle, path: string, into: string[]): Promise<void> {
    for await (const [name, handle] of directory.entries()) {
      const full = path === '' ? name : `${path}/${name}`;
      if (handle.kind === 'directory') {
        await this.#walk(handle, full, into);
      } else if (!full.endsWith('.tmp')) {
        // Skip leftovers from interrupted writes.
        into.push(full);
      }
    }
  }

  async remove(key: string): Promise<void> {
    const resolved = await this.#resolve(key, false);
    if (resolved === null) return;
    await resolved.parent.removeEntry(resolved.name).catch(() => undefined);
  }
}

/** Whether OPFS is available in this environment. */
export function isOpfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}
