/**
 * Project history in a vault, the way Git does it: immutable commits that name their
 * parents and a tree of projects, and branches that point at commits. Commits are made
 * locally and work offline; `push` and `pull` move them. The server sees sealed blobs and
 * sealed branch heads, nothing it can read (../DESIGN.md).
 *
 * The local copy is kept through `ObjectCache`, whose two methods are a subset of
 * `@bezier/storage`'s `StorageBackend`, so the app's OPFS or desktop backend plugs in as
 * it is. Every device that has pulled is a full replica of what it pulled.
 */

import { concat, fromB64, fromUtf8, toB64, utf8 } from '../protocol/bytes.ts';
import { openObject, refId, sealObject } from '../protocol/crypto.ts';
import { sign, verify } from '../protocol/identity.ts';
import { type Branch, BranchHeads } from './branch-heads.ts';
import type { Connection } from './connection.ts';
import { asDocument, mergeDocuments } from './document-merge.ts';
import { type Conflict, keepBoth, mergeTrees, type Tree, type TreeEntry } from './merge.ts';
import type { VaultHandle } from './vault-client.ts';

const TAG_CHUNK = 0;
const TAG_JSON = 1;

/** Large enough that a model is a few objects, small enough to resume a slow upload. */
const CHUNK = 4 * 1024 * 1024;

export interface ObjectCache {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, data: Uint8Array): Promise<void>;
}

export interface Commit {
  readonly id: string;
  readonly parents: readonly string[];
  readonly tree: Tree;
  readonly author: string;
  readonly message: string;
  readonly at: string;
  /** False if the signature does not match the author. Shown, not hidden: see `readCommit`. */
  readonly verified: boolean;
}

export type { Branch } from './branch-heads.ts';

export interface MergeOutcome {
  readonly head: string;
  /** Projects both sides changed whose features merged cleanly. */
  readonly merged: readonly string[];
  /** Projects that could not be merged and were kept side by side (or left, with `stop`). */
  readonly conflicts: readonly Conflict[];
}

type Sealed =
  | { kind: 'chunk'; bytes: Uint8Array }
  | { kind: 'document'; size: number; chunks: string[] }
  | {
      kind: 'commit';
      parents: string[];
      tree: Tree;
      author: string;
      message: string;
      at: string;
      signature: string;
    };

export type PushResult = { ok: true; head: string } | { ok: false; remoteHead: string };

export class Repository {
  readonly #conn: Connection;
  readonly #vault: VaultHandle;
  readonly #cache: ObjectCache;
  readonly #heads: BranchHeads;

  get vault(): VaultHandle {
    return this.#vault;
  }

  constructor(conn: Connection, vault: VaultHandle, cache: ObjectCache) {
    this.#conn = conn;
    this.#vault = vault;
    this.#cache = cache;
    this.#heads = new BranchHeads(conn, vault, cache);
  }

  // Projects.

  /** Seals a project's bytes (its snapshot as the app serializes it) and returns its id. */
  async putDocument(bytes: Uint8Array): Promise<string> {
    const chunks: string[] = [];
    for (let at = 0; at < bytes.length || at === 0; at += CHUNK) {
      chunks.push(await this.#put({ kind: 'chunk', bytes: bytes.subarray(at, at + CHUNK) }));
      if (bytes.length === 0) break;
    }
    return this.#put({ kind: 'document', size: bytes.length, chunks });
  }

  async getDocument(id: string): Promise<Uint8Array> {
    const doc = await this.#get(id);
    if (doc.kind !== 'document') throw new Error(`${id} is not a project.`);
    const out = new Uint8Array(doc.size);
    let at = 0;
    for (const chunkId of doc.chunks) {
      const chunk = await this.#get(chunkId);
      if (chunk.kind !== 'chunk') throw new Error(`${chunkId} is not part of a project.`);
      out.set(chunk.bytes, at);
      at += chunk.bytes.length;
    }
    return out;
  }

  /** A project's size in bytes, from its manifest, without fetching its content. */
  async documentSize(id: string): Promise<number> {
    const doc = await this.#get(id);
    return doc.kind === 'document' ? doc.size : 0;
  }

  // Commits.

  async commit(parents: readonly string[], tree: Tree, message: string): Promise<string> {
    const body = {
      parents: [...parents],
      tree,
      author: this.#conn.identity.userId,
      message,
      at: new Date().toISOString(),
    };
    const signature = await sign(this.#conn.identity, utf8(signedText(body)));
    return this.#put({ kind: 'commit', ...body, signature: toB64(signature) });
  }

  /**
   * Reads a commit and checks its signature against the author's key. Any member can
   * write commits, so without this one member could commit in another's name. A bad
   * signature is reported rather than thrown, so a history with one forged entry can
   * still be opened and the forgery shown.
   */
  async readCommit(id: string): Promise<Commit> {
    const c = await this.#get(id);
    if (c.kind !== 'commit') throw new Error(`${id} is not a commit.`);
    const { signature, kind: _kind, ...body } = c;
    const author = await this.#conn.user(c.author).catch(() => null);
    const verified =
      author !== null &&
      (await verify(fromB64(author.signPublic), utf8(signedText(body)), fromB64(signature)));
    return {
      id,
      parents: c.parents,
      tree: c.tree,
      author: c.author,
      message: c.message,
      at: c.at,
      verified,
    };
  }

  async *log(head: string, limit = 100): AsyncGenerator<Commit> {
    const seen = new Set<string>();
    const queue = [head];
    while (queue.length > 0 && seen.size < limit) {
      const id = queue.shift();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      const commit = await this.readCommit(id);
      yield commit;
      queue.push(...commit.parents);
    }
  }

  /**
   * Every commit reachable from any of `heads`, newest first by discovery, up to `limit`.
   * Used by the history graph to show all branches at once.
   */
  async history(heads: readonly string[], limit = 300): Promise<Commit[]> {
    const seen = new Set<string>();
    const out: Commit[] = [];
    const queue = [...heads];
    while (queue.length > 0 && out.length < limit) {
      const id = queue.shift();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      const commit = await this.readCommit(id);
      out.push(commit);
      queue.push(...commit.parents);
    }
    return out;
  }

  // Branches.

  branches(): Promise<Branch[]> {
    return this.#heads.list();
  }

  async branch(name: string): Promise<Branch | null> {
    return (await this.branches()).find((b) => b.name === name) ?? null;
  }

  /**
   * Uploads what the server lacks, then moves the branch, but only if nobody else moved it
   * since `base` (the branch as last seen, or null for a new branch). If someone did, the
   * caller merges with `remoteHead` and pushes again.
   */
  async push(name: string, head: string, base: Branch | null): Promise<PushResult> {
    const ids = await this.#reachable(head);
    for (const id of await this.#conn.missing(this.#vault.id, ids)) {
      const sealed = await this.#cache.read(this.#key(id));
      if (sealed === null) throw new Error(`Object ${id} is not on this device; pull first.`);
      await this.#conn.putObject(this.#vault.id, id, sealed);
    }
    // Everything up to here is on the server now; the next push need not walk it again.
    for (const id of ids) await this.#markOnServer(id);

    const { ref, value, version } = await this.#heads.seal(name, head, base);
    const moved = await this.#conn.moveRef(this.#vault.id, ref, base?.etag ?? null, value);
    if (moved.ok) {
      await this.#heads.remember(ref, version);
      return { ok: true, head };
    }
    const current = moved.current === null ? null : await this.#heads.open(moved.current.value);
    // Deleted meanwhile: there is nothing to merge with, so create it again.
    if (current === null) return this.push(name, head, null);
    return { ok: false, remoteHead: current.head };
  }

  async deleteBranch(branch: Branch): Promise<boolean> {
    const ref = await refId(this.#vault.keyring, branch.name);
    return (await this.#conn.moveRef(this.#vault.id, ref, branch.etag, null)).ok;
  }

  /**
   * Makes a commit's history available offline: every commit, and with `withProjects`
   * every project in every tree. Without it, projects download when first opened.
   */
  async fetch(head: string, withProjects = false): Promise<void> {
    for await (const commit of this.log(head, Number.POSITIVE_INFINITY)) {
      if (withProjects)
        for (const entry of Object.values(commit.tree)) await this.getDocument(entry.document);
    }
  }

  // Merging.

  async mergeBase(a: string, b: string): Promise<string | null> {
    const ancestors = new Set<string>();
    for await (const c of this.log(a, Number.POSITIVE_INFINITY)) ancestors.add(c.id);
    for await (const c of this.log(b, Number.POSITIVE_INFINITY))
      if (ancestors.has(c.id)) return c.id;
    return null;
  }

  /**
   * Merges `theirs` into `ours`. Fast-forwards when one contains the other. Otherwise a
   * three-way merge by project; a project both sides changed is merged feature by feature
   * (document-merge.ts). What still conflicts is kept side by side with `keep-both`, or
   * returned uncommitted with `stop`.
   */
  async merge(
    ours: string,
    theirs: string,
    options: { message?: string; onConflict?: 'keep-both' | 'stop' } = {},
  ): Promise<MergeOutcome> {
    const base = await this.mergeBase(ours, theirs);
    if (base === theirs) return { head: ours, merged: [], conflicts: [] };
    if (base === ours) return { head: theirs, merged: [], conflicts: [] };
    const baseTree = base === null ? {} : (await this.readCommit(base)).tree;
    const [o, t] = [await this.readCommit(ours), await this.readCommit(theirs)];
    const result = mergeTrees(baseTree, o.tree, t.tree);

    const tree: Record<string, TreeEntry> = { ...result.tree };
    const merged: string[] = [];
    const conflicts: Conflict[] = [];
    for (const c of result.conflicts) {
      const inside = await this.#mergeInside(c);
      if (inside === null) conflicts.push(c);
      else {
        tree[c.project] = inside;
        merged.push(c.project);
      }
    }
    if (conflicts.length > 0 && options.onConflict === 'stop') {
      return { head: ours, merged, conflicts };
    }
    const resolved = keepBoth({ tree, conflicts }, t.author.slice(0, 6));
    const head = await this.commit([ours, theirs], resolved, options.message ?? 'Merge');
    return { head, merged, conflicts };
  }

  /** A project both sides changed, merged by feature, or null if that is not possible. */
  async #mergeInside(c: Conflict): Promise<TreeEntry | null> {
    if (c.base === null || c.ours === null || c.theirs === null) return null;
    const read = async (id: string) => {
      try {
        return asDocument(JSON.parse(fromUtf8(await this.getDocument(id))));
      } catch {
        return null;
      }
    };
    const [b, o, t] = [
      await read(c.base.document),
      await read(c.ours.document),
      await read(c.theirs.document),
    ];
    if (b === null || o === null || t === null) return null;
    const result = mergeDocuments(b, o, t);
    if (result.conflicts.length > 0) return null;
    const name = c.ours.name === c.base.name ? c.theirs.name : c.ours.name;
    const document = await this.putDocument(utf8(JSON.stringify(result.document)));
    return { name, document };
  }

  // Objects.

  /**
   * One tag byte, then either raw bytes (a chunk) or JSON (anything else). Chunks stay raw
   * because base64 inside JSON would make every stored model a third larger.
   */
  async #put(value: Sealed): Promise<string> {
    const plain =
      value.kind === 'chunk'
        ? concat(Uint8Array.of(TAG_CHUNK), value.bytes)
        : concat(Uint8Array.of(TAG_JSON), utf8(JSON.stringify(value)));
    const { id, sealed } = await sealObject(this.#vault.keyring, plain);
    await this.#cache.write(this.#key(id), sealed);
    return id;
  }

  async #get(id: string): Promise<Sealed> {
    const local = await this.#cache.read(this.#key(id));
    const sealed = local ?? (await this.#conn.getObject(this.#vault.id, id));
    // Opened before caching, so a bad download never lands in the local copy.
    const plain = await openObject(this.#vault.keyring, id, sealed);
    if (local === null) {
      await this.#cache.write(this.#key(id), sealed);
      await this.#markOnServer(id);
    }
    if (plain[0] === TAG_CHUNK) return { kind: 'chunk', bytes: plain.subarray(1) };
    return JSON.parse(fromUtf8(plain.subarray(1))) as Sealed;
  }

  /**
   * Every object a head needs that the server may lack. Stops at commits known to be on
   * the server: a branch only ever points at a commit whose whole history was uploaded
   * first, so everything behind one is there too.
   */
  async #reachable(head: string): Promise<string[]> {
    const out = new Set<string>();
    const queue = [head];
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined || out.has(id) || (await this.#isOnServer(id))) continue;
      const commit = await this.readCommit(id);
      out.add(id);
      for (const entry of Object.values(commit.tree)) {
        if (out.has(entry.document)) continue;
        out.add(entry.document);
        const doc = await this.#get(entry.document);
        if (doc.kind === 'document') for (const chunk of doc.chunks) out.add(chunk);
      }
      queue.push(...commit.parents);
    }
    return [...out];
  }

  async #isOnServer(id: string): Promise<boolean> {
    return (await this.#cache.read(`sync/${this.#vault.id}/on-server/${id}`)) !== null;
  }

  async #markOnServer(id: string): Promise<void> {
    await this.#cache.write(`sync/${this.#vault.id}/on-server/${id}`, new Uint8Array(0));
  }

  #key(id: string): string {
    return `sync/${this.#vault.id}/objects/${id}`;
  }
}

/** What a commit's signature covers: everything but the signature, in a fixed order. */
function signedText(body: {
  parents: readonly string[];
  tree: Tree;
  author: string;
  message: string;
  at: string;
}) {
  const tree = Object.keys(body.tree)
    .sort()
    .map((k) => [k, body.tree[k]?.name, body.tree[k]?.document]);
  return JSON.stringify([
    'bezier-commit-v1',
    body.parents,
    tree,
    body.author,
    body.message,
    body.at,
  ]);
}
