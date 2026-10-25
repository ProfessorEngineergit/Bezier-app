/**
 * Invitation codes for the alpha channel, verified offline. A code is a short message signed with
 * the project's private key (Ed25519); the app holds the public key.
 *
 * Message (11 bytes): kind (1 = alpha), random id (6), expiry in Unix seconds (4, big-endian; 0 for
 * none). The 64-byte signature follows; all base64url-encoded after `BZ-`. Codes carry no name
 * (`scripts/invite.mjs` keeps that).
 *
 * This gates features in a client the user controls; it is not a security boundary. Anything
 * security-relevant (server accounts, enrollment codes) is checked by the server.
 */

import { INVITE_PUBLIC_KEY } from './invite-key.js';
import { REVOKED_INVITES } from './invite-revoked.js';

export const INVITE_PREFIX = 'BZ-';
/** Domain separation prefix for the signed message. */
const DOMAIN = 'bezier-invite-v1';
const PAYLOAD = 11;
const SIGNATURE = 64;
const ALPHA_KIND = 1;

export interface Invite {
  /** Six random bytes as 12 hex characters; used for revocation. */
  id: string;
  /** Expiry in Unix seconds, or null for none. */
  expires: number | null;
}

export type InviteFailure =
  /** Not a well-formed code. */
  | 'malformed'
  /** Signature does not verify. */
  | 'signature'
  | 'expired'
  | 'revoked'
  /** This browser cannot check an Ed25519 signature. */
  | 'unsupported';

export type InviteResult = { ok: true; invite: Invite } | { ok: false; reason: InviteFailure };

/** User-facing text for a failure. */
export function inviteFailureText(reason: InviteFailure): string {
  switch (reason) {
    case 'malformed':
      return 'That is not an invitation code. Copy it whole, from BZ- to the end.';
    case 'signature':
      return 'That code was not made for Bezier, or it was changed after it was made.';
    case 'expired':
      return 'That invitation has run out. Ask for a new one.';
    case 'revoked':
      return 'That invitation was withdrawn. Ask for a new one.';
    case 'unsupported':
      return 'This browser cannot check invitation codes. Use the Bezier app, or a current browser.';
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

type Bytes = Uint8Array<ArrayBuffer>;

export function bytesFromBase64Url(text: string): Bytes | null {
  if (!BASE64URL.test(text)) return null;
  try {
    const padded = text
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(text.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Strips whitespace, since codes pasted from email may be wrapped. */
export function cleanCode(code: string): string {
  return code.replace(/\s+/g, '');
}

function signedMessage(payload: Uint8Array): Bytes {
  const domain = new TextEncoder().encode(DOMAIN);
  const message = new Uint8Array(domain.length + payload.length);
  message.set(domain, 0);
  message.set(payload, domain.length);
  return message;
}

export function readPayload(payload: Uint8Array): Invite | null {
  if (payload.length !== PAYLOAD || payload[0] !== ALPHA_KIND) return null;
  const id = Array.from(payload.slice(1, 7), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const seconds = new DataView(payload.buffer, payload.byteOffset + 7, 4).getUint32(0, false);
  return { id, expires: seconds === 0 ? null : seconds };
}

let activeKey = INVITE_PUBLIC_KEY;

/** Replaces the verification key. For development builds and tests only. */
export function setInviteKey(key: string): void {
  activeKey = key;
}

export async function verifyInvite(
  code: string,
  now: number = Date.now(),
  publicKey: string = activeKey,
  revoked: readonly string[] = REVOKED_INVITES,
): Promise<InviteResult> {
  const text = cleanCode(code);
  if (!text.startsWith(INVITE_PREFIX)) return { ok: false, reason: 'malformed' };
  const bytes = bytesFromBase64Url(text.slice(INVITE_PREFIX.length));
  if (bytes === null || bytes.length !== PAYLOAD + SIGNATURE)
    return { ok: false, reason: 'malformed' };
  const payload = bytes.slice(0, PAYLOAD);
  const invite = readPayload(payload);
  if (invite === null) return { ok: false, reason: 'malformed' };

  const key = bytesFromBase64Url(publicKey);
  if (key === null) return { ok: false, reason: 'unsupported' };
  let genuine: boolean;
  try {
    const imported = await crypto.subtle.importKey('raw', key, 'Ed25519', false, ['verify']);
    genuine = await crypto.subtle.verify(
      'Ed25519',
      imported,
      bytes.slice(PAYLOAD),
      signedMessage(payload),
    );
  } catch {
    return { ok: false, reason: 'unsupported' };
  }
  if (!genuine) return { ok: false, reason: 'signature' };
  if (revoked.includes(invite.id)) return { ok: false, reason: 'revoked' };
  if (invite.expires !== null && invite.expires * 1000 <= now)
    return { ok: false, reason: 'expired' };
  return { ok: true, invite };
}

/** The message to sign, for the signing script and tests. */
export function inviteMessage(payload: Uint8Array): Bytes {
  return signedMessage(payload);
}
