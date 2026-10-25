/**
 * Who else has a shared project open: "Bob is editing this on Bob's MacBook". Each device
 * sends a heartbeat while a shared project is open and stops when it closes; the server
 * forgets a device whose heartbeat stops (server/presence.ts).
 *
 * Name, machine and project are sealed with the vault key. The server sees that a
 * member's device is active in a vault and nothing more.
 */

import { fromB64, toB64, toHex } from '../protocol/bytes.ts';
import { openValue, randomBytes, sealValue } from '../protocol/crypto.ts';
import type { PresenceEntry } from '../protocol/wire.ts';
import type { Connection } from './connection.ts';
import type { VaultHandle } from './vault-client.ts';

export type PresenceMode = 'editing' | 'viewing';

export interface PresenceState {
  /** The user's display name in this vault. */
  readonly name: string;
  /** What the machine is called: "Alice's MacBook Pro", "Workshop PC". */
  readonly machine: string;
  /** The project open, by its id in the vault's tree, and the branch it is on. */
  readonly project: string;
  readonly branch: string;
  readonly mode: PresenceMode;
}

export interface Present extends PresenceState {
  readonly userId: string;
  readonly device: string;
  readonly since: string;
  /** This device: shown as "you" or left out. */
  readonly self: boolean;
}

/** How often a device says it is still there, and how long the server waits for the next. */
export const HEARTBEAT_MS = 25_000;
const TTL_S = 70;

/** A device id: random, made once per installation and kept (by the caller). */
export function newDeviceId(): string {
  return toHex(randomBytes(16));
}

export class PresenceClient {
  readonly #conn: Connection;
  readonly #vault: VaultHandle;
  readonly #device: string;
  #since = new Date().toISOString();

  constructor(conn: Connection, vault: VaultHandle, device: string) {
    this.#conn = conn;
    this.#vault = vault;
    this.#device = device;
  }

  async beat(state: PresenceState): Promise<void> {
    const sealed = await sealValue(
      this.#vault.keyring,
      { ...state, since: this.#since },
      'presence',
    );
    await this.#conn.call('PUT', `/v1/vaults/${this.#vault.id}/presence/${this.#device}`, {
      sealed: toB64(sealed),
      ttl: TTL_S,
    });
  }

  async leave(): Promise<void> {
    await this.#conn.call('DELETE', `/v1/vaults/${this.#vault.id}/presence/${this.#device}`);
    this.#since = new Date().toISOString();
  }

  async list(): Promise<Present[]> {
    const { presence } = (await this.#conn.call(
      'GET',
      `/v1/vaults/${this.#vault.id}/presence`,
    )) as { presence: PresenceEntry[] };
    const out: Present[] = [];
    for (const entry of presence) {
      try {
        const v = (await openValue(
          this.#vault.keyring,
          fromB64(entry.sealed),
          'presence',
        )) as Partial<PresenceState & { since: string }>;
        out.push({
          userId: entry.userId,
          device: entry.device,
          name: text(v.name, 'Someone'),
          machine: text(v.machine, 'a device'),
          project: text(v.project, ''),
          branch: text(v.branch, 'main'),
          mode: v.mode === 'viewing' ? 'viewing' : 'editing',
          since: text(v.since, ''),
          self: entry.device === this.#device,
        });
      } catch {
        // Sealed with a key this device does not have (an old epoch's member): not shown.
      }
    }
    return out;
  }
}

/** Others on one project, for the notice in the project's title bar. */
export function othersOn(present: readonly Present[], project: string): Present[] {
  return present.filter((p) => !p.self && p.project === project);
}

/** "Bob on Bob's MacBook", "Bob and Carol", "Bob and 2 others". */
export function describePresence(present: readonly Present[]): string {
  const names = [...new Set(present.map((p) => p.name))];
  const first = present[0];
  if (first === undefined) return '';
  const verb = present.some((p) => p.mode === 'editing') ? 'editing' : 'viewing';
  if (present.length === 1) return `${first.name} is ${verb} this on ${first.machine}.`;
  if (names.length === 1) return `${first.name} is ${verb} this on ${present.length} devices.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are ${verb} this.`;
  return `${names[0]} and ${names.length - 1} others are ${verb} this.`;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.slice(0, 80) : fallback;
}
