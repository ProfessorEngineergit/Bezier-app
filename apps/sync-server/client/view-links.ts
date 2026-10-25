/**
 * Read-only links: a link anyone can open to look at a vault's projects, without an
 * account and without being able to change anything.
 *
 *   https://server/#view=<vault>.<secret>&branch=<name>&project=<id>
 *
 * Everything after `#` stays in the browser. The secret opens the keyring the server
 * holds for the link; `branch` and `project` say what to show first. The server enforces
 * read-only: the link's token reaches only the read routes. Because the keyring opens the
 * whole vault, a link shows every project in it, and the app says so where one is made.
 */

import { fromB64, toB64 } from '../protocol/bytes.ts';
import {
  type Keyring,
  openValue,
  parseKeyring,
  randomBytes,
  sealValue,
  serializeKeyring,
} from '../protocol/crypto.ts';
import { inviteMaterial, newIdentity, openInvite, sealInvite } from '../protocol/identity.ts';
import type { VaultDetail } from '../protocol/wire.ts';
import { Connection, SyncError } from './connection.ts';
import type { VaultHandle } from './vault-client.ts';

export interface ViewLink {
  readonly id: string;
  readonly label: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ParsedViewLink {
  readonly server: string;
  readonly vault: string;
  readonly secret: Uint8Array;
  readonly branch: string | null;
  readonly project: string | null;
}

/** What opening a link gives: a connection that can only read, and the vault's keys. */
export interface OpenedView {
  readonly conn: Connection;
  readonly vault: VaultHandle;
  readonly branch: string | null;
  readonly project: string | null;
}

export async function createViewLink(
  conn: Connection,
  vault: VaultHandle,
  options: { label: string; days?: number; branch?: string; project?: string },
): Promise<{ link: string; id: string }> {
  const secret = randomBytes(32);
  const { tokenHash } = await inviteMaterial(secret);
  await conn.call('POST', `/v1/vaults/${vault.id}/views`, {
    tokenHash,
    payload: await sealInvite(secret, serializeKeyring(vault.keyring)),
    expiresAt: new Date(Date.now() + (options.days ?? 30) * 86_400_000).toISOString(),
    label: toB64(await sealValue(vault.keyring, { label: options.label }, 'view')),
    epoch: vault.keyring.current.epoch,
  });
  const base = conn.baseUrl === '' ? globalThis.location.origin : conn.baseUrl;
  const extra = new URLSearchParams();
  if (options.branch !== undefined) extra.set('branch', options.branch);
  if (options.project !== undefined) extra.set('project', options.project);
  const tail = extra.size > 0 ? `&${extra.toString()}` : '';
  return { link: `${base}/#view=${vault.id}.${toB64(secret)}${tail}`, id: tokenHash };
}

export async function listViewLinks(conn: Connection, vault: VaultHandle): Promise<ViewLink[]> {
  const detail = (await conn.call('GET', `/v1/vaults/${vault.id}`)) as VaultDetail;
  return Promise.all(
    detail.views.map(async (v) => ({
      id: v.id,
      label: await labelOf(vault.keyring, v.label),
      createdBy: v.createdBy,
      createdAt: v.createdAt,
      expiresAt: v.expiresAt,
    })),
  );
}

export async function withdrawViewLink(conn: Connection, vault: VaultHandle, id: string) {
  await conn.call('DELETE', `/v1/vaults/${vault.id}/views/${id}`);
}

export function parseViewLink(link: string): ParsedViewLink | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  const params = new URLSearchParams(url.hash.slice(1));
  const match = /^([0-9a-f]{32})\.([\w-]{43})$/.exec(params.get('view') ?? '');
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return {
    server: url.origin,
    vault: match[1],
    secret: fromB64(match[2]),
    branch: params.get('branch'),
    project: params.get('project'),
  };
}

/**
 * Opens a link: no account, a throwaway identity for the connection (it never signs
 * anything the server keeps), the keyring from the link.
 */
export async function openViewLink(
  link: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenedView> {
  const parsed = parseViewLink(link);
  if (parsed === null) throw new SyncError(400, 'That is not a read-only link.', null);
  const { token } = await inviteMaterial(parsed.secret);
  const conn = new Connection(parsed.server, await newIdentity(), fetchImpl, {
    view: { vault: parsed.vault, token },
  });
  const { payload } = (await conn.call('POST', `/v1/vaults/${parsed.vault}/views/open`, {})) as {
    payload: string;
  };
  const keyring = await parseKeyring(await openInvite(parsed.secret, fromB64(payload)));
  return {
    conn,
    vault: { id: parsed.vault, name: 'Shared with you', role: 'reader', keyring },
    branch: parsed.branch,
    project: parsed.project,
  };
}

async function labelOf(keyring: Keyring, sealed: string): Promise<string> {
  try {
    const value = (await openValue(keyring, fromB64(sealed), 'view')) as { label?: unknown };
    return typeof value.label === 'string' ? value.label.slice(0, 120) : '';
  } catch {
    return '';
  }
}
