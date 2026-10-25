/**
 * Server-to-server mirroring: a second server keeps a full copy of the first and catches up
 * on a timer.
 *
 * The mirror copies ciphertext only and never gets a vault key. Its access is one token
 * (BEZIER_SYNC_MIRROR_TOKEN on the first server), which opens only the two /v1/mirror routes.
 *
 * Objects are immutable, so a mirror only adds them. Branch heads, members and accounts follow
 * the first server. A vault deleted there is kept on the mirror, since surviving a deletion is
 * what a safety copy is for; the command reports each one it keeps.
 */

import { fromB64, toB64, toHex } from '../protocol/bytes.ts';
import { sha256 } from '../protocol/crypto.ts';
import type { MirrorManifest } from '../protocol/wire.ts';
import { HttpError } from './auth.ts';
import type { Store } from './store.ts';

/** Checks `Authorization: Mirror <token>` against the configured token, in constant time. */
export async function requireMirror(header: string | undefined, token: string | undefined) {
  if (token === undefined) throw new HttpError(404, 'Nothing here.');
  const given = header?.startsWith('Mirror ') ? header.slice(7) : '';
  const [a, b] = [
    await sha256(new TextEncoder().encode(given)),
    await sha256(new TextEncoder().encode(token)),
  ];
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff !== 0) throw new HttpError(401, 'That mirror token is not right.');
}

export async function manifest(store: Store): Promise<MirrorManifest> {
  const users: MirrorManifest['users'] = [];
  for (const file of await store.names('users')) {
    const data = await store.read(`users/${file}`);
    if (data !== null && /^[0-9a-f]{32}\.json$/.test(file)) {
      users.push({ id: file.slice(0, 32), record: toB64(data) });
    }
  }
  const vaults: MirrorManifest['vaults'] = [];
  for (const id of await store.names('vaults')) {
    if (!/^[0-9a-f]{32}$/.test(id)) continue;
    const record = await store.read(`vaults/${id}/vault.json`);
    if (record === null) continue;
    const refs: { ref: string; value: string }[] = [];
    for (const ref of await store.names(`vaults/${id}/refs`)) {
      const value = await store.read(`vaults/${id}/refs/${ref}`);
      if (value !== null) refs.push({ ref, value: toB64(value) });
    }
    vaults.push({ id, record: toB64(record), refs, objects: await store.objectIds(id) });
  }
  return { users, vaults };
}

export interface MirrorReport {
  users: number;
  vaults: number;
  objects: number;
  refs: number;
  /** Vaults gone from the first server and kept here. */
  kept: string[];
  /** Objects that arrived damaged twice. The next run tries again. */
  failed: string[];
}

/** Brings `store` level with the server at `from`. Safe to run again at any time. */
export async function pullMirror(
  store: Store,
  from: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorReport> {
  const base = from.replace(/\/+$/, '');
  const headers = { Authorization: `Mirror ${token}` };
  const res = await fetchImpl(`${base}/v1/mirror/manifest`, { headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `The first server answered ${res.status}.`);
  }
  const m = (await res.json()) as MirrorManifest;
  const report: MirrorReport = { users: 0, vaults: 0, objects: 0, refs: 0, kept: [], failed: [] };

  for (const user of m.users) {
    if (!/^[0-9a-f]{32}$/.test(user.id)) continue;
    if (await changed(store, `users/${user.id}.json`, user.record)) report.users += 1;
  }

  for (const vault of m.vaults) {
    if (!/^[0-9a-f]{32}$/.test(vault.id)) continue;
    // Objects first, then branch heads, then the record: a head written before its objects
    // would point a mirror's reader at history it does not have yet.
    for (const id of vault.objects) {
      if (!/^[0-9a-f]{64}$/.test(id) || (await store.hasObject(vault.id, id))) continue;
      const ok = await fetchObject(store, base, headers, vault.id, id, fetchImpl);
      if (ok) report.objects += 1;
      else report.failed.push(`${vault.id}/${id}`);
    }
    const wanted = new Set<string>();
    for (const { ref, value } of vault.refs) {
      if (!/^[0-9a-f]{32}$/.test(ref)) continue;
      wanted.add(ref);
      if (await changed(store, `vaults/${vault.id}/refs/${ref}`, value)) report.refs += 1;
    }
    for (const ref of await store.names(`vaults/${vault.id}/refs`)) {
      if (!wanted.has(ref)) {
        await store.remove(`vaults/${vault.id}/refs/${ref}`);
        report.refs += 1;
      }
    }
    if (await changed(store, `vaults/${vault.id}/vault.json`, vault.record)) report.vaults += 1;
  }

  const there = new Set(m.vaults.map((v) => v.id));
  for (const id of await store.names('vaults')) if (!there.has(id)) report.kept.push(id);
  return report;
}

async function changed(store: Store, rel: string, value: string): Promise<boolean> {
  const bytes = fromB64(value);
  const here = await store.read(rel);
  if (here !== null && toHex(await sha256(here)) === toHex(await sha256(bytes))) return false;
  await store.write(rel, bytes);
  return true;
}

async function fetchObject(
  store: Store,
  base: string,
  headers: Record<string, string>,
  vault: string,
  id: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl(`${base}/v1/mirror/vaults/${vault}/objects/${id}`, { headers });
    if (!res.ok) continue;
    const data = new Uint8Array(await res.arrayBuffer());
    // putObject checks the hash: a damaged transfer is refused, never stored.
    if ((await store.putObject(vault, id, data)) !== 'mismatch') return true;
  }
  return false;
}
