/**
 * Vaults from the app's side: creating, listing, renaming, sharing, invites, leaving and
 * removing people. Everything secret is sealed or opened here, on the device.
 *
 * Removing a member starts a new key epoch (`removeMember`): the remaining members get a
 * keyring with one more key, and new content is sealed with a key the removed member never
 * had.
 */

import { fromB64, toB64 } from '../protocol/bytes.ts';
import {
  type Keyring,
  newKeyring,
  openValue,
  parseKeyring,
  randomBytes,
  refId,
  rotated,
  sealValue,
  serializeKeyring,
} from '../protocol/crypto.ts';
import { inviteMaterial, openInvite, sealInvite, unwrap, wrapFor } from '../protocol/identity.ts';
import type {
  InviteInfo,
  InviteOpenResponse,
  Role,
  VaultDetail,
  VaultSummary,
} from '../protocol/wire.ts';
import { type Connection, SyncError } from './connection.ts';

export interface VaultHandle {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly keyring: Keyring;
}

export interface Member {
  readonly userId: string;
  readonly role: Role;
  readonly addedAt: string;
  /** What they call themselves in this vault, or null if they have not said. */
  readonly name: string | null;
}

export interface VaultInfo {
  readonly handle: VaultHandle;
  readonly createdAt: string;
  readonly members: readonly Member[];
  readonly protected: readonly string[];
  readonly invites: readonly InviteInfo[];
  readonly usage: { bytes: number; limit: number | null };
}

export class VaultClient {
  readonly conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  async list(): Promise<VaultHandle[]> {
    const { vaults } = (await this.conn.call('GET', '/v1/vaults')) as { vaults: VaultSummary[] };
    const out: VaultHandle[] = [];
    for (const summary of vaults) {
      // One unreadable vault (a key wrapped wrongly by a buggy client) must not hide the rest.
      try {
        out.push(await this.#open(summary));
      } catch {
        // Left out; `get` on it reports the problem.
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<VaultInfo> {
    const detail = (await this.conn.call('GET', `/v1/vaults/${id}`)) as VaultDetail;
    const handle = await this.#open(detail);
    const members = await Promise.all(
      detail.members.map(async (m) => ({
        userId: m.userId,
        role: m.role,
        addedAt: m.addedAt,
        name: m.profile === undefined ? null : await profileName(handle.keyring, m.profile),
      })),
    );
    return {
      handle,
      createdAt: detail.createdAt,
      members,
      protected: detail.protected,
      invites: detail.invites,
      usage: detail.usage,
    };
  }

  async create(name: string, displayName?: string): Promise<VaultHandle> {
    const keyring = await newKeyring();
    const me = this.conn.identity;
    const { vault } = (await this.conn.call('POST', '/v1/vaults', {
      wrappedKey: await wrapFor(serializeKeyring(keyring), me.boxPublic, me.userId),
      meta: toB64(await sealValue(keyring, { name }, 'meta')),
    })) as { vault: string };
    const handle: VaultHandle = { id: vault, name, role: 'admin', keyring };
    if (displayName !== undefined) await this.setDisplayName(handle, displayName);
    return handle;
  }

  async rename(vault: VaultHandle, name: string): Promise<VaultHandle> {
    const meta = toB64(await sealValue(vault.keyring, { name }, 'meta'));
    await this.conn.call('PUT', `/v1/vaults/${vault.id}/meta`, { meta });
    return { ...vault, name };
  }

  async remove(vault: VaultHandle): Promise<void> {
    await this.conn.call('DELETE', `/v1/vaults/${vault.id}`);
  }

  async setDisplayName(vault: VaultHandle, name: string): Promise<void> {
    const profile = toB64(await sealValue(vault.keyring, { name }, 'profile'));
    await this.conn.call('PUT', `/v1/vaults/${vault.id}/profile`, { profile });
  }

  /**
   * Shares with someone already on the server, by their user id. The keyring is wrapped
   * to their public key here; the server only relays it.
   */
  async share(vault: VaultHandle, userId: string, role: Role): Promise<void> {
    const user = await this.conn.user(userId);
    await this.conn.call('PUT', `/v1/vaults/${vault.id}/members/${userId}`, {
      role,
      wrappedKey: await wrapFor(serializeKeyring(vault.keyring), fromB64(user.boxPublic), userId),
      epoch: vault.keyring.current.epoch,
    });
  }

  /**
   * Removes someone and, unless told not to, rotates the key so they cannot read what is
   * written afterwards even with a copy of the server's disk. Returns the vault under its
   * new key. Leaving yourself does not rotate: the remaining admins decide that.
   */
  async removeMember(vault: VaultHandle, userId: string, rotate = true): Promise<VaultHandle> {
    await this.conn.call('DELETE', `/v1/vaults/${vault.id}/members/${userId}`);
    if (!rotate || userId === this.conn.identity.userId) return vault;
    return this.rotate(vault);
  }

  async rotate(vault: VaultHandle): Promise<VaultHandle> {
    for (let attempt = 0; ; attempt++) {
      const info = await this.get(vault.id);
      const next = await rotated(info.handle.keyring);
      const ring = serializeKeyring(next);
      const wrappedKeys: Record<string, string> = {};
      for (const m of info.members) {
        const user = await this.conn.user(m.userId);
        wrappedKeys[m.userId] = await wrapFor(ring, fromB64(user.boxPublic), m.userId);
      }
      try {
        await this.conn.call('POST', `/v1/vaults/${vault.id}/rotate`, {
          fromEpoch: info.handle.keyring.current.epoch,
          wrappedKeys,
          meta: toB64(await sealValue(next, { name: info.handle.name }, 'meta')),
        });
        return { ...info.handle, keyring: next };
      } catch (error) {
        // Someone joined or left in between: build the list again, a few times at most.
        if (!(error instanceof SyncError) || error.status !== 409 || attempt >= 2) throw error;
      }
    }
  }

  /** Which branches only admins may move, by name. */
  async protect(vault: VaultHandle, branches: readonly string[]): Promise<void> {
    const refs = await Promise.all(branches.map((b) => refId(vault.keyring, b)));
    await this.conn.call('PUT', `/v1/vaults/${vault.id}/protected`, { refs });
  }

  /**
   * An invite link for someone not on the server yet. Everything after `#` stays in the
   * browser, so the link is the only secret: whoever holds it can join, the server
   * holding the sealed keyring cannot.
   */
  async invite(vault: VaultHandle, role: Role, options: { days?: number; uses?: number } = {}) {
    const secret = randomBytes(32);
    const { tokenHash } = await inviteMaterial(secret);
    const days = options.days ?? 7;
    await this.conn.call('POST', `/v1/vaults/${vault.id}/invites`, {
      tokenHash,
      role,
      payload: await sealInvite(secret, serializeKeyring(vault.keyring)),
      expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
      uses: options.uses ?? 1,
      epoch: vault.keyring.current.epoch,
    });
    const base = this.conn.baseUrl === '' ? globalThis.location.origin : this.conn.baseUrl;
    return { link: `${base}/#join=${vault.id}.${toB64(secret)}`, id: tokenHash };
  }

  async withdrawInvite(vault: VaultHandle, id: string): Promise<void> {
    await this.conn.call('DELETE', `/v1/vaults/${vault.id}/invites/${id}`);
  }

  /** Follows an invite link: registers if needed, opens the keyring, joins. */
  async join(link: string, displayName?: string): Promise<VaultHandle> {
    const parsed = parseInviteLink(link);
    if (parsed === null) throw new SyncError(400, 'That is not an invite link.', null);
    const { vault, secret } = parsed;
    const { token } = await inviteMaterial(secret);
    // Registering is idempotent for the same keys and the invite stays valid until claimed,
    // so no "am I registered" probe is needed (a refused login shows as a browser error).
    await this.conn.register({ invite: { vault, token } });
    const opened = (await this.conn.call('POST', `/v1/vaults/${vault}/invites/open`, {
      token,
    })) as InviteOpenResponse;
    const ring = await openInvite(secret, fromB64(opened.payload));
    const me = this.conn.identity;
    await this.conn.call('POST', `/v1/vaults/${vault}/invites/claim`, {
      token,
      wrappedKey: await wrapFor(ring, me.boxPublic, me.userId),
    });
    const joined = (await this.get(vault)).handle;
    if (displayName !== undefined) await this.setDisplayName(joined, displayName);
    return joined;
  }

  async #open(summary: VaultSummary): Promise<VaultHandle> {
    const keyring = await parseKeyring(
      await unwrap(this.conn.identity, fromB64(summary.wrappedKey)),
    );
    const meta = (await openValue(keyring, fromB64(summary.meta), 'meta')) as { name?: string };
    return { id: summary.vault, name: meta.name ?? 'Untitled vault', role: summary.role, keyring };
  }
}

export function parseInviteLink(link: string): { vault: string; secret: Uint8Array } | null {
  const match = /#join=([0-9a-f]{32})\.([\w-]{43})$/.exec(link.trim());
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return { vault: match[1], secret: fromB64(match[2]) };
}

async function profileName(keyring: Keyring, sealed: string): Promise<string | null> {
  try {
    const value = (await openValue(keyring, fromB64(sealed), 'profile')) as { name?: unknown };
    return typeof value.name === 'string' ? value.name.slice(0, 80) : null;
  } catch {
    return null;
  }
}
