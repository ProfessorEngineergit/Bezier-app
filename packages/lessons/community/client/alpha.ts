/**
 * Whether this device holds a valid invitation to the alpha channel.
 *
 * The code is stored as given and re-verified at every start (`verifyInvite`), so access depends on
 * the signature, not on a storage flag. Until the async check completes, alpha reads as closed and
 * the app briefly shows beta.
 */

import { BUILD_CHANNEL } from './build-channel.js';
import { type Invite, type InviteFailure, verifyInvite } from './invite.js';

const KEY = 'bezier.invite';

export type Redeemed = { ok: true; invite: Invite } | { ok: false; reason: InviteFailure };

let invite: Invite | null = null;
let started = false;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** For `useSyncExternalStore`. */
export function onAlphaChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The invitation this device holds, or null. Referentially stable until it changes. */
export function currentInvite(): Invite | null {
  startOnce();
  return invite;
}

export function alphaOpen(): boolean {
  return BUILD_CHANNEL === 'alpha' || currentInvite() !== null;
}

/** Reads and verifies the stored code on first access. */
function startOnce(): void {
  if (started) return;
  started = true;
  const storage = browserStorage();
  let stored: string | null = null;
  try {
    stored = storage?.getItem(KEY) ?? null;
  } catch {
    stored = null;
  }
  if (stored === null) return;
  void verifyInvite(stored).then((result) => {
    // Forget codes that no longer verify (expired or revoked).
    if (result.ok) invite = result.invite;
    else forget(storage);
    notify();
  });
}

function forget(storage: Storage | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Storage unavailable; nothing to forget.
  }
}

/** Verifies a code and stores it if valid. */
export async function redeemInvite(code: string): Promise<Redeemed> {
  startOnce();
  const result = await verifyInvite(code);
  if (!result.ok) return result;
  invite = result.invite;
  try {
    browserStorage()?.setItem(KEY, code.replace(/\s+/g, ''));
  } catch (error) {
    // Without storage the invitation lasts for this session only.
    console.warn('Could not remember the invitation.', error);
  }
  notify();
  return result;
}

export function forgetInvite(): void {
  startOnce();
  invite = null;
  forget(browserStorage());
  notify();
}
