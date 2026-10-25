/**
 * Who has what open, right now. Each device sends a heartbeat while a shared project is
 * open; it is forgotten when it is not renewed. Kept in memory only: it is about the
 * present, and after a restart every device says it again within a heartbeat.
 *
 * What a device is doing (the project, its own name, the machine's name) is sealed with
 * the vault key, so the server learns only that a member's device is active in a vault.
 */

import { isHexId } from '../protocol/bytes.ts';
import type { PresenceEntry } from '../protocol/wire.ts';
import { HttpError } from './auth.ts';
import { checkSealed } from './vaults.ts';

/** A heartbeat lasts at most this long. Long enough to survive a missed beat, no more. */
const MAX_TTL_S = 120;

/** Bounded so one member cannot fill the server's memory with made-up devices. */
const MAX_DEVICES_PER_VAULT = 200;

interface Beat {
  userId: string;
  sealed: string;
  expires: number;
}

export class Presence {
  readonly #vaults = new Map<string, Map<string, Beat>>();

  list(vault: string): PresenceEntry[] {
    const beats = this.#sweep(vault);
    return [...beats].map(([device, b]) => ({
      userId: b.userId,
      device,
      sealed: b.sealed,
      expiresAt: new Date(b.expires).toISOString(),
    }));
  }

  beat(vault: string, userId: string, device: string, sealed: string, ttl: number): void {
    if (!isHexId(device, 32)) throw new HttpError(400, 'That is not a device id.');
    checkSealed(sealed);
    const beats = this.#sweep(vault);
    const known = beats.get(device);
    // A device id belongs to whoever used it first, so one member cannot overwrite
    // another's presence by guessing their device.
    if (known !== undefined && known.userId !== userId) {
      throw new HttpError(409, 'That device id is in use.');
    }
    if (known === undefined && beats.size >= MAX_DEVICES_PER_VAULT) {
      throw new HttpError(429, 'Too many devices are active in this vault.');
    }
    const seconds = Math.max(5, Math.min(MAX_TTL_S, Number(ttl) || 60));
    beats.set(device, { userId, sealed, expires: Date.now() + seconds * 1000 });
  }

  leave(vault: string, userId: string, device: string): void {
    const beats = this.#vaults.get(vault);
    if (beats?.get(device)?.userId === userId) beats.delete(device);
  }

  /** Forgets everyone of a member, when they leave or are removed. */
  forget(vault: string, userId: string): void {
    const beats = this.#vaults.get(vault);
    if (beats === undefined) return;
    for (const [device, b] of beats) if (b.userId === userId) beats.delete(device);
  }

  #sweep(vault: string): Map<string, Beat> {
    let beats = this.#vaults.get(vault);
    if (beats === undefined) {
      beats = new Map();
      this.#vaults.set(vault, beats);
    }
    const now = Date.now();
    for (const [device, b] of beats) if (b.expires < now) beats.delete(device);
    return beats;
  }
}
