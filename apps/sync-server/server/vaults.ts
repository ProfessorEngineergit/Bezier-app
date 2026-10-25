/**
 * Vaults, members, invites and key rotation. A vault is the unit of sharing: one keyring,
 * one member list, any number of projects and branches inside it.
 *
 * The server enforces roles (a reader cannot move a branch) but cannot see content. Access
 * control is on the server, confidentiality and authorship on the clients (../DESIGN.md).
 */

import { fromB64, isHexId, toHex } from '../protocol/bytes.ts';
import { randomBytes, sha256 } from '../protocol/crypto.ts';
import type {
  InviteRequest,
  MemberRequest,
  Role,
  RotateRequest,
  VaultDetail,
  VaultSummary,
} from '../protocol/wire.ts';
import { atLeast, ROLES } from '../protocol/wire.ts';
import { HttpError } from './auth.ts';
import type { Store } from './store.ts';

interface Member {
  role: Role;
  wrappedKey: string;
  addedAt: string;
  profile?: string;
}

interface Invite {
  role: Role;
  payload: string;
  expiresAt: string;
  uses: number;
}

export interface View {
  payload: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  label: string;
}

export interface VaultRecord {
  id: string;
  createdAt: string;
  meta: string;
  epoch: number;
  members: Record<string, Member>;
  invites: Record<string, Invite>;
  protected: string[];
  usage: number;
  /** Read-only links. Absent in vaults made before there were any. */
  views?: Record<string, View>;
}

/** Invites stop working after this even if asked to last longer. Links leak. */
const MAX_INVITE_DAYS = 30;

/**
 * A sealed value the server keeps for a client. Bounded so a vault record stays small;
 * a wrapped keyring grows by about 60 bytes per rotation, so this allows a few hundred.
 */
const MAX_SEALED = 32_768;

export class Vaults {
  readonly #store: Store;
  readonly #quota: number | null;

  constructor(store: Store, quotaBytes: number | null = null) {
    this.#store = store;
    this.#quota = quotaBytes;
  }

  async create(userId: string, wrappedKey: string, meta: string): Promise<string> {
    checkSealed(wrappedKey, meta);
    const id = toHex(randomBytes(16));
    const now = new Date().toISOString();
    await this.#save({
      id,
      createdAt: now,
      meta,
      epoch: 0,
      members: { [userId]: { role: 'admin', wrappedKey, addedAt: now } },
      invites: {},
      protected: [],
      usage: 0,
    });
    return id;
  }

  /** Scans every vault. A home server holds a handful, so there is no index to drift. */
  async listFor(userId: string): Promise<VaultSummary[]> {
    const out: VaultSummary[] = [];
    for (const id of await this.#store.names('vaults')) {
      const vault = await this.load(id);
      const member = vault?.members[userId];
      if (vault !== null && member !== undefined) out.push(summary(vault, member));
    }
    return out;
  }

  async detail(vault: string, userId: string): Promise<VaultDetail> {
    const role = await this.require(vault, userId, 'reader');
    const record = await this.#mustLoad(vault);
    const member = record.members[userId];
    if (member === undefined) throw new HttpError(404, 'No such vault.');
    const now = Date.now();
    return {
      ...summary(record, member),
      createdAt: record.createdAt,
      members: Object.entries(record.members).map(([id, m]) => ({
        userId: id,
        role: m.role,
        addedAt: m.addedAt,
        ...(m.profile === undefined ? {} : { profile: m.profile }),
      })),
      protected: [...record.protected],
      // Pending invites are visible to admins only.
      invites:
        role === 'admin'
          ? Object.entries(record.invites)
              .filter(([, inv]) => Date.parse(inv.expiresAt) > now && inv.uses > 0)
              .map(([id, inv]) => ({
                id,
                role: inv.role,
                expiresAt: inv.expiresAt,
                uses: inv.uses,
              }))
          : [],
      views: atLeast(role, 'writer')
        ? Object.entries(record.views ?? {})
            .filter(([, v]) => Date.parse(v.expiresAt) > now)
            .map(([id, v]) => ({
              id,
              createdBy: v.createdBy,
              createdAt: v.createdAt,
              expiresAt: v.expiresAt,
              label: v.label,
            }))
        : [],
      usage: { bytes: record.usage, limit: this.#quota },
    };
  }

  /**
   * The caller's role, or a 404 if they are not a member. Not a 403: whether a vault
   * exists is itself something a stranger should not learn.
   */
  async require(vault: string, userId: string, at: Role): Promise<Role> {
    const record = isHexId(vault, 32) ? await this.load(vault) : null;
    const member = record?.members[userId];
    if (record === null || member === undefined) throw new HttpError(404, 'No such vault.');
    if (!atLeast(member.role, at)) {
      throw new HttpError(403, `This needs ${at} access; you have ${member.role}.`);
    }
    return member.role;
  }

  async setMeta(vault: string, admin: string, meta: string) {
    checkSealed(meta);
    await this.update(vault, admin, 'admin', (record) => {
      record.meta = meta;
    });
  }

  async setProfile(vault: string, userId: string, profile: string) {
    checkSealed(profile);
    await this.update(vault, userId, 'reader', (record) => {
      const member = record.members[userId];
      if (member !== undefined) member.profile = profile;
    });
  }

  async remove(vault: string, admin: string) {
    await this.update(vault, admin, 'admin', () => {});
    await this.#store.exclusive(`vault:${vault}`, () => this.#store.removeTree(`vaults/${vault}`));
  }

  async setMember(vault: string, admin: string, target: string, req: MemberRequest) {
    if (!ROLES.includes(req.role)) throw new HttpError(400, 'Unknown role.');
    checkSealed(req.wrappedKey);
    await this.update(vault, admin, 'admin', (record) => {
      // A keyring wrapped before a rotation would let the new member read old work only.
      if (req.epoch !== record.epoch) {
        throw new HttpError(409, 'The vault key changed meanwhile. Share again.');
      }
      const before = record.members[target];
      if (before?.role === 'admin' && req.role !== 'admin') assertAnotherAdmin(record, target);
      record.members[target] = {
        ...before,
        role: req.role,
        wrappedKey: req.wrappedKey,
        addedAt: before?.addedAt ?? new Date().toISOString(),
      };
    });
  }

  async removeMember(vault: string, caller: string, target: string) {
    // Leaving needs no rights; removing someone else needs admin.
    const needed: Role = caller === target ? 'reader' : 'admin';
    await this.update(vault, caller, needed, (record) => {
      if (record.members[target] === undefined) throw new HttpError(404, 'Not a member.');
      if (record.members[target]?.role === 'admin') assertAnotherAdmin(record, target);
      delete record.members[target];
    });
  }

  /**
   * Starts a new key epoch. The caller must hand a wrapped keyring to exactly the current
   * members: one too few would lock someone out, one too many would let a removed member
   * back in. Pending invites and read-only links hold the old keyring, so they are withdrawn.
   */
  async rotate(vault: string, admin: string, req: RotateRequest) {
    checkSealed(req.meta, ...Object.values(req.wrappedKeys));
    await this.update(vault, admin, 'admin', (record) => {
      if (req.fromEpoch !== record.epoch) {
        throw new HttpError(409, 'Someone else changed the vault key meanwhile. Try again.');
      }
      const members = Object.keys(record.members).sort();
      const wrapped = Object.keys(req.wrappedKeys).sort();
      if (members.join() !== wrapped.join()) {
        throw new HttpError(409, 'The member list changed meanwhile. Try again.');
      }
      for (const [id, member] of Object.entries(record.members)) {
        member.wrappedKey = req.wrappedKeys[id] ?? member.wrappedKey;
      }
      record.epoch += 1;
      record.meta = req.meta;
      // Invites and read-only links hold the old keyring; they would open nothing new.
      record.invites = {};
      record.views = {};
    });
  }

  async setProtected(vault: string, admin: string, refs: readonly string[]) {
    if (refs.length > 1000 || !refs.every((r) => isHexId(r, 32))) {
      throw new HttpError(400, 'Those are not branch ids.');
    }
    await this.update(vault, admin, 'admin', (record) => {
      record.protected = [...new Set(refs)];
    });
  }

  async createInvite(vault: string, admin: string, req: InviteRequest) {
    if (!isHexId(req.tokenHash, 64) || !ROLES.includes(req.role)) {
      throw new HttpError(400, 'That invite is malformed.');
    }
    checkSealed(req.payload);
    const latest = Date.now() + MAX_INVITE_DAYS * 86_400_000;
    const expires = Math.min(Date.parse(req.expiresAt) || latest, latest);
    await this.update(vault, admin, 'admin', (record) => {
      if (req.epoch !== record.epoch) {
        throw new HttpError(409, 'The vault key changed meanwhile. Create the invite again.');
      }
      record.invites[req.tokenHash] = {
        role: req.role,
        payload: req.payload,
        expiresAt: new Date(expires).toISOString(),
        uses: Math.max(1, Math.min(req.uses, 100)),
      };
    });
  }

  async withdrawInvite(vault: string, admin: string, hash: string) {
    await this.update(vault, admin, 'admin', (record) => {
      delete record.invites[hash];
    });
  }

  /** The invite behind a token, if it is still good. Changes nothing. */
  async invite(vault: string, token: string): Promise<Invite | null> {
    const record = isHexId(vault, 32) ? await this.load(vault) : null;
    if (record === null) return null;
    const invite = record.invites[await tokenHash(token)];
    if (invite === undefined || invite.uses < 1 || Date.parse(invite.expiresAt) < Date.now()) {
      return null;
    }
    return invite;
  }

  async claim(vault: string, userId: string, token: string, wrappedKey: string): Promise<Role> {
    checkSealed(wrappedKey);
    const hash = await tokenHash(token);
    return this.#store.exclusive(`vault:${vault}`, async () => {
      const record = isHexId(vault, 32) ? await this.load(vault) : null;
      const invite = record?.invites[hash];
      if (record === null || invite === undefined || invite.uses < 1) {
        throw new HttpError(404, 'This invite is not valid any more.');
      }
      if (Date.parse(invite.expiresAt) < Date.now()) {
        throw new HttpError(410, 'This invite has expired. Ask for a new one.');
      }
      invite.uses -= 1;
      if (invite.uses === 0) delete record.invites[hash];
      const before = record.members[userId];
      // An invite never lowers what someone already has.
      const role =
        before !== undefined && atLeast(before.role, invite.role) ? before.role : invite.role;
      record.members[userId] = {
        ...before,
        role,
        wrappedKey,
        addedAt: before?.addedAt ?? new Date().toISOString(),
      };
      await this.#save(record);
      return role;
    });
  }

  /**
   * Counts newly stored bytes against the vault, refusing them past the quota. Checked
   * before the write and counted after, under the vault's lock.
   */
  async charge(vault: string, bytes: number, write: () => Promise<boolean>): Promise<void> {
    await this.#store.exclusive(`vault:${vault}`, async () => {
      const record = await this.#mustLoad(vault);
      if (this.#quota !== null && record.usage + bytes > this.#quota) {
        throw new HttpError(507, 'This vault is full. Ask the server owner for more space.');
      }
      if (await write()) {
        record.usage += bytes;
        await this.#save(record);
      }
    });
  }

  // Records.

  async update(vault: string, caller: string, at: Role, change: (r: VaultRecord) => void) {
    await this.#store.exclusive(`vault:${vault}`, async () => {
      // Inside the queue, so a role taken away a moment ago is not still honoured.
      await this.require(vault, caller, at);
      const record = await this.#mustLoad(vault);
      change(record);
      await this.#save(record);
    });
  }

  load(id: string): Promise<VaultRecord | null> {
    return this.#store.readJson<VaultRecord>(`vaults/${id}/vault.json`);
  }

  async #mustLoad(id: string): Promise<VaultRecord> {
    const record = await this.load(id);
    if (record === null) throw new HttpError(404, 'No such vault.');
    return record;
  }

  #save(record: VaultRecord): Promise<void> {
    return this.#store.writeJson(`vaults/${record.id}/vault.json`, record);
  }
}

function summary(record: VaultRecord, member: Member): VaultSummary {
  return {
    vault: record.id,
    role: member.role,
    wrappedKey: member.wrappedKey,
    meta: record.meta,
    epoch: record.epoch,
  };
}

function assertAnotherAdmin(record: VaultRecord, leaving: string): void {
  const others = Object.entries(record.members).filter(
    ([id, m]) => id !== leaving && m.role === 'admin',
  );
  if (others.length === 0) {
    throw new HttpError(409, 'A vault needs at least one admin. Make someone else admin first.');
  }
}

export function checkSealed(...values: string[]): void {
  for (const value of values) {
    if (typeof value !== 'string' || value.length > MAX_SEALED || !/^[\w-]*$/.test(value)) {
      throw new HttpError(400, 'A sealed value is malformed or too large.');
    }
  }
}

async function tokenHash(token: string): Promise<string> {
  return toHex(await sha256(fromB64(token)));
}
