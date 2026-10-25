/**
 * Read-only links. A link carries a secret in its URL fragment; the server keeps the
 * vault's keyring sealed under a key derived from it, and a hash of a token derived from
 * it, exactly like an invite (../protocol/identity.ts). Whoever holds the link can read
 * the vault without an account and can change nothing: the token opens only the read
 * routes, never a write.
 *
 * What a link can read is the whole vault, not one project: the keyring opens everything
 * sealed with it, and the server cannot tell which objects belong to which project. The
 * app says so where a link is made.
 */

import { fromB64, isHexId, toHex } from '../protocol/bytes.ts';
import { sha256 } from '../protocol/crypto.ts';
import type { ViewRequest } from '../protocol/wire.ts';
import { HttpError } from './auth.ts';
import { checkSealed, type Vaults, type View } from './vaults.ts';

/** Links stop working after this even if asked to last longer. */
const MAX_VIEW_DAYS = 90;

export class Views {
  readonly #vaults: Vaults;

  constructor(vaults: Vaults) {
    this.#vaults = vaults;
  }

  async create(vault: string, user: string, req: ViewRequest): Promise<void> {
    if (!isHexId(req.tokenHash, 64)) throw new HttpError(400, 'That link is malformed.');
    checkSealed(req.payload, req.label);
    const latest = Date.now() + MAX_VIEW_DAYS * 86_400_000;
    const expires = Math.min(Date.parse(req.expiresAt) || latest, latest);
    await this.#vaults.update(vault, user, 'writer', (record) => {
      if (req.epoch !== record.epoch) {
        throw new HttpError(409, 'The vault key changed meanwhile. Make the link again.');
      }
      record.views ??= {};
      record.views[req.tokenHash] = {
        payload: req.payload,
        createdBy: user,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(expires).toISOString(),
        label: req.label,
      };
    });
  }

  async withdraw(vault: string, user: string, hash: string): Promise<void> {
    await this.#vaults.update(vault, user, 'writer', (record) => {
      delete record.views?.[hash];
    });
  }

  /**
   * The link behind a token, or a 404. The same answer whether the vault does not exist or
   * the token is wrong, so a guess learns nothing about which vaults are there.
   */
  async require(vault: string, token: string): Promise<View> {
    const record = isHexId(vault, 32) ? await this.#vaults.load(vault) : null;
    let hash = '';
    try {
      hash = toHex(await sha256(fromB64(token)));
    } catch {
      // A token that is not base64 matches nothing.
    }
    const view = record?.views?.[hash];
    if (view === undefined || Date.parse(view.expiresAt) < Date.now()) {
      throw new HttpError(404, 'This link does not work any more. Ask for a new one.');
    }
    return view;
  }
}
