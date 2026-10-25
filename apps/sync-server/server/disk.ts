/**
 * Atomic file writes: write a temporary file, fsync it, rename it over the old one, so a power
 * cut leaves either the old or the new version. Same rule as the app (ADR 0009).
 */

import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeAtomic(path: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
  // The rename itself is only durable once the directory is synced. Not every filesystem
  // allows opening a directory (some network mounts do not), and failing there would
  // refuse writes that did succeed, so it is best effort.
  try {
    const dir = await open(dirname(path), 'r');
    await dir.sync().finally(() => dir.close());
  } catch {
    // Best effort, see above.
  }
}

export async function readOrNull(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function removeIfThere(path: string): Promise<void> {
  await rm(path, { force: true });
}

/** Names in a directory, or none if it does not exist. Temporary files are left out. */
export async function namesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((n) => !n.endsWith('.tmp'));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** Every file under `dir`, as paths relative to it. */
export async function walkFiles(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(dir, prefix), { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return out;
    throw error;
  }
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walkFiles(dir, rel)));
    else if (!entry.name.endsWith('.tmp')) out.push(rel);
  }
  return out;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Runs tasks with the same key one after another. A compare-and-swap is a read and a
 * write, and two pushes to one branch arriving together must not both read the old head.
 */
export class KeyedQueue {
  readonly #tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    const tail = next.catch(() => undefined);
    this.#tails.set(key, tail);
    void tail.then(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    });
    return next;
  }
}
