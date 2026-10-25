/**
 * Branch heads as the server holds them: sealed, signed and numbered. A head names the branch,
 * its commit, a version incremented on every move, the author and the time, signed by the
 * author.
 *
 * The version detects a server replaying a genuine older head. Each device remembers the
 * highest version it has seen per branch and flags anything lower.
 */

import { fromB64, fromUtf8, toB64, utf8 } from '../protocol/bytes.ts';
import { openValue, refId, sealValue } from '../protocol/crypto.ts';
import { sign, verify } from '../protocol/identity.ts';
import type { Connection } from './connection.ts';
import type { ObjectCache } from './repository.ts';
import type { VaultHandle } from './vault-client.ts';

export interface Branch {
  readonly name: string;
  readonly head: string;
  readonly etag: string;
  /** Goes up by one with every move. What rollback detection compares. */
  readonly version: number;
  readonly author: string;
  readonly at: string;
  /** False if the signature does not match the author named. */
  readonly verified: boolean;
  /**
   * True if this device has seen this branch at a later version before: the server is
   * showing an older, genuine state.
   */
  readonly rolledBack: boolean;
}

interface HeadValue {
  name: string;
  head: string;
  version: number;
  author: string;
  at: string;
  signature: string;
}

export class BranchHeads {
  readonly #conn: Connection;
  readonly #vault: VaultHandle;
  readonly #cache: ObjectCache;

  constructor(conn: Connection, vault: VaultHandle, cache: ObjectCache) {
    this.#conn = conn;
    this.#vault = vault;
    this.#cache = cache;
  }

  async list(): Promise<Branch[]> {
    const out: Branch[] = [];
    for (const entry of await this.#conn.refs(this.#vault.id)) {
      const value = await this.open(entry.value);
      // A head filed under the wrong id, or unreadable, was not put there by a member.
      if (value === null || (await refId(this.#vault.keyring, value.name)) !== entry.ref) continue;
      const seen = await this.#seen(entry.ref);
      if (value.version > seen) await this.remember(entry.ref, value.version);
      out.push({
        name: value.name,
        head: value.head,
        etag: entry.etag,
        version: value.version,
        author: value.author,
        at: value.at,
        verified: await this.#verify(value),
        rolledBack: value.version < seen,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** A new head for `name` at `head`, numbered past both `base` and anything seen here. */
  async seal(name: string, head: string, base: Branch | null) {
    const ref = await refId(this.#vault.keyring, name);
    const version = Math.max(base?.version ?? 0, await this.#seen(ref)) + 1;
    const body = {
      name,
      head,
      version,
      author: this.#conn.identity.userId,
      at: new Date().toISOString(),
    };
    const signature = toB64(await sign(this.#conn.identity, utf8(headText(this.#vault.id, body))));
    const value = await sealValue(this.#vault.keyring, { ...body, signature }, 'ref');
    return { ref, value, version };
  }

  async open(value: string): Promise<HeadValue | null> {
    try {
      const raw = (await openValue(
        this.#vault.keyring,
        fromB64(value),
        'ref',
      )) as Partial<HeadValue>;
      if (typeof raw.name !== 'string' || typeof raw.head !== 'string') return null;
      return {
        name: raw.name,
        head: raw.head,
        version: typeof raw.version === 'number' ? raw.version : 0,
        author: raw.author ?? '',
        at: raw.at ?? '',
        signature: raw.signature ?? '',
      };
    } catch {
      return null;
    }
  }

  async remember(ref: string, version: number): Promise<void> {
    await this.#cache.write(this.#seenKey(ref), utf8(String(version)));
  }

  async #verify(value: HeadValue): Promise<boolean> {
    const author = await this.#conn.user(value.author).catch(() => null);
    if (author === null) return false;
    const text = utf8(headText(this.#vault.id, value));
    return verify(fromB64(author.signPublic), text, fromB64(value.signature));
  }

  async #seen(ref: string): Promise<number> {
    const data = await this.#cache.read(this.#seenKey(ref));
    return data === null ? 0 : Number(fromUtf8(data)) || 0;
  }

  #seenKey(ref: string): string {
    return `apps/sync-server/${this.#vault.id}/seen/${ref}`;
  }
}

/** What a head's signature covers. The vault id is in it, so it cannot be replayed elsewhere. */
function headText(
  vault: string,
  head: { name: string; head: string; version: number; author: string; at: string },
): string {
  return JSON.stringify([
    'bezier-ref-v1',
    vault,
    head.name,
    head.head,
    head.version,
    head.author,
    head.at,
  ]);
}
