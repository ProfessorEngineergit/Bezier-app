/**
 * Branch heads: one small sealed file per branch, moved only by compare-and-swap.
 */

import { fromB64, isHexId, toB64, toHex } from '../protocol/bytes.ts';
import { sha256 } from '../protocol/crypto.ts';
import type { RefEntry, Role } from '../protocol/wire.ts';
import { atLeast } from '../protocol/wire.ts';
import { HttpError } from './auth.ts';
import type { Store } from './store.ts';
import type { Vaults } from './vaults.ts';

const MAX_REF = 64 * 1024;

export type MoveResult =
  | { ok: true; entry: RefEntry | null }
  | { ok: false; current: RefEntry | null };

export class Refs {
  readonly #store: Store;
  readonly #vaults: Vaults;

  constructor(store: Store, vaults: Vaults) {
    this.#store = store;
    this.#vaults = vaults;
  }

  async list(vault: string): Promise<RefEntry[]> {
    const out: RefEntry[] = [];
    for (const ref of await this.#store.names(`vaults/${vault}/refs`)) {
      const value = await this.#store.read(`vaults/${vault}/refs/${ref}`);
      if (value !== null) out.push({ ref, etag: toHex(await sha256(value)), value: toB64(value) });
    }
    return out;
  }

  /**
   * Compare-and-swap. The client says which version it built on; if that is not what is
   * there, nothing is written and the current value comes back for a merge. This is what
   * keeps concurrent pushes from overwriting each other.
   *
   * A protected branch needs admin. The server cannot read branch names, but it can
   * compare ids, which is all protection needs.
   */
  async move(
    vault: string,
    role: Role,
    ref: string,
    ifMatch: string | null,
    value: string | null,
  ): Promise<MoveResult> {
    if (!isHexId(ref, 32)) throw new HttpError(400, 'That is not a branch id.');
    const record = await this.#vaults.load(vault);
    if (record?.protected.includes(ref) === true && !atLeast(role, 'admin')) {
      throw new HttpError(403, 'This branch is protected; only admins can change it.');
    }
    const rel = `vaults/${vault}/refs/${ref}`;
    return this.#store.exclusive(rel, async () => {
      const there = await this.#store.read(rel);
      const current: RefEntry | null =
        there === null ? null : { ref, etag: toHex(await sha256(there)), value: toB64(there) };
      if ((current?.etag ?? null) !== ifMatch) return { ok: false, current };
      if (value === null) {
        await this.#store.remove(rel);
        return { ok: true, entry: null };
      }
      const bytes = fromB64(value);
      if (bytes.length > MAX_REF) throw new HttpError(413, 'A branch head is too large.');
      await this.#store.write(rel, bytes);
      return { ok: true, entry: { ref, etag: toHex(await sha256(bytes)), value } };
    });
  }
}
