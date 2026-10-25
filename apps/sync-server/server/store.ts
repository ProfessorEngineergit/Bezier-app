/**
 * Where the server keeps things: a primary directory and any number of replicas (a second
 * disk, a NAS mount, a USB drive). Every write goes to all of them. Every read is checked
 * against its hash and repaired from a replica if the primary copy is missing or rotten.
 *
 * Objects can be checked without the vault key because their id is the SHA-256 of their
 * sealed bytes (protocol/crypto.ts, `sealObject`). So the server can find and fix bit rot
 * in data it cannot read.
 *
 *   <root>/users/<user>.json
 *   <root>/vaults/<vault>/vault.json
 *   <root>/vaults/<vault>/objects/<id[0..2]>/<id>
 *   <root>/vaults/<vault>/refs/<ref>
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { toHex } from '../protocol/bytes.ts';
import { sha256 } from '../protocol/crypto.ts';
import { KeyedQueue, namesIn, readOrNull, removeIfThere, walkFiles, writeAtomic } from './disk.ts';

export interface ReplicaState {
  path: string;
  ok: boolean;
  lastError?: string;
}

export interface ScrubReport {
  checked: number;
  repaired: string[];
  /** Objects with no good copy anywhere. Only a client's local copy can bring them back. */
  lost: string[];
}

export class Store {
  readonly #roots: readonly string[];
  readonly #state: ReplicaState[];
  readonly #queue = new KeyedQueue();

  constructor(primary: string, replicas: readonly string[] = []) {
    this.#roots = [primary, ...replicas];
    this.#state = this.#roots.map((path) => ({ path, ok: true }));
  }

  get replicas(): readonly ReplicaState[] {
    return this.#state;
  }

  /** Serialize work on one key (a ref, a vault's membership) across requests. */
  exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    return this.#queue.run(key, task);
  }

  // Plain files: user records, vault records, refs.

  async read(rel: string): Promise<Uint8Array | null> {
    for (const root of this.#roots) {
      try {
        const data = await readOrNull(join(root, rel));
        if (data !== null) return data;
      } catch {
        // An unreadable replica is reported by the next write to it; try the next one.
      }
    }
    return null;
  }

  async readJson<T>(rel: string): Promise<T | null> {
    const data = await this.read(rel);
    return data === null ? null : (JSON.parse(new TextDecoder().decode(data)) as T);
  }

  /**
   * Written to the primary first, and a primary failure fails the request. A replica that
   * fails is marked and skipped, so a pulled USB drive does not take the server down, and
   * `scrub` copies what it missed once it is back.
   */
  async write(rel: string, data: Uint8Array): Promise<void> {
    const [primary, ...replicas] = this.#roots;
    if (primary === undefined) throw new Error('No storage directory configured.');
    await writeAtomic(join(primary, rel), data);
    await Promise.all(
      replicas.map(async (root, i) => {
        const state = this.#state[i + 1];
        try {
          await writeAtomic(join(root, rel), data);
          if (state !== undefined) {
            state.ok = true;
            delete state.lastError;
          }
        } catch (error) {
          if (state !== undefined) {
            state.ok = false;
            state.lastError = error instanceof Error ? error.message : String(error);
            // The operator needs to know a copy fell behind; the API only says that one did.
            console.error(`replica ${root} missed ${rel}: ${state.lastError}`);
          }
        }
      }),
    );
  }

  writeJson(rel: string, value: unknown): Promise<void> {
    return this.write(rel, new TextEncoder().encode(JSON.stringify(value, null, 2)));
  }

  async remove(rel: string): Promise<void> {
    await Promise.all(this.#roots.map((root) => removeIfThere(join(root, rel)).catch(() => {})));
  }

  /** Deletes a directory from every copy. Only used to delete a whole vault. */
  async removeTree(rel: string): Promise<void> {
    await Promise.all(
      this.#roots.map((root) => rm(join(root, rel), { recursive: true, force: true })),
    );
  }

  async names(rel: string): Promise<string[]> {
    const [primary] = this.#roots;
    return primary === undefined ? [] : namesIn(join(primary, rel));
  }

  // Objects: immutable and content-addressed.

  objectPath(vault: string, id: string): string {
    return `vaults/${vault}/objects/${id.slice(0, 2)}/${id}`;
  }

  /** Every object id stored for a vault, from the primary copy. */
  async objectIds(vault: string): Promise<string[]> {
    const [primary] = this.#roots;
    if (primary === undefined) return [];
    const files = await walkFiles(join(primary, `vaults/${vault}/objects`)).catch(() => []);
    return files.map((rel) => rel.split('/').pop() ?? '').filter((id) => /^[0-9a-f]{64}$/.test(id));
  }

  async hasObject(vault: string, id: string): Promise<boolean> {
    return (await this.getObject(vault, id)) !== null;
  }

  /**
   * Stores an object unless it is already there. Objects are immutable, so a second upload
   * of the same id changes nothing; reporting 'exists' lets the caller not count it twice.
   */
  async putObject(
    vault: string,
    id: string,
    data: Uint8Array,
  ): Promise<'stored' | 'exists' | 'mismatch'> {
    if (toHex(await sha256(data)) !== id) return 'mismatch';
    const rel = this.objectPath(vault, id);
    return this.exclusive(rel, async () => {
      if ((await this.getObject(vault, id)) !== null) return 'exists';
      await this.write(rel, data);
      return 'stored';
    });
  }

  /** The object from the first copy whose hash checks out, repairing the others on the way. */
  async getObject(vault: string, id: string): Promise<Uint8Array | null> {
    const rel = this.objectPath(vault, id);
    const bad: string[] = [];
    for (const root of this.#roots) {
      const data = await readOrNull(join(root, rel)).catch(() => null);
      if (data !== null && toHex(await sha256(data)) === id) {
        for (const other of bad) await writeAtomic(join(other, rel), data).catch(() => {});
        return data;
      }
      bad.push(root);
    }
    return null;
  }

  /**
   * Checks every object on every copy and rewrites any that is missing or damaged from a
   * copy that is good. Also brings mutable files (refs, vault records) on the replicas
   * level with the primary. Meant for a nightly timer: `bezier-sync scrub`.
   */
  async scrub(): Promise<ScrubReport> {
    const report: ScrubReport = { checked: 0, repaired: [], lost: [] };
    const all = new Set<string>();
    for (const root of this.#roots) {
      for (const rel of await walkFiles(root).catch(() => [])) all.add(rel);
    }
    for (const rel of [...all].sort()) {
      const match = /^vaults\/[0-9a-f]+\/objects\/[0-9a-f]{2}\/([0-9a-f]{64})$/.exec(rel);
      report.checked += 1;
      if (match?.[1] !== undefined) {
        await this.#scrubObject(rel, match[1], report);
      } else {
        const [primary] = this.#roots;
        const data = primary === undefined ? null : await readOrNull(join(primary, rel));
        if (data !== null) await this.#level(rel, data, report);
      }
    }
    return report;
  }

  async #scrubObject(rel: string, id: string, report: ScrubReport): Promise<void> {
    let good: Uint8Array | null = null;
    for (const root of this.#roots) {
      const data = await readOrNull(join(root, rel)).catch(() => null);
      if (data !== null && toHex(await sha256(data)) === id) {
        good = data;
        break;
      }
    }
    if (good === null) report.lost.push(rel);
    else await this.#level(rel, good, report);
  }

  async #level(rel: string, data: Uint8Array, report: ScrubReport): Promise<void> {
    for (const root of this.#roots) {
      const there = await readOrNull(join(root, rel)).catch(() => null);
      if (there !== null && Buffer.compare(there, data) === 0) continue;
      await writeAtomic(join(root, rel), data);
      report.repaired.push(`${root}/${rel}`);
    }
  }
}
