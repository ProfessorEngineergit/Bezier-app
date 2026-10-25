/**
 * People and devices: identities, logging in, handing a vault's keys to a member, invite
 * links, and a passphrase-protected backup of an identity.
 *
 * An identity is two key pairs made on the device: Ed25519 to sign (logins, commits,
 * branch heads) and X25519 to receive vault keys. The private halves never leave it,
 * except in a backup the user asks for.
 */

import { buf, concat, fromB64, fromUtf8, toB64, toHex, utf8 } from './bytes.ts';
import { gcmOpen, gcmSeal, hkdf, randomBytes, sha256, subtle } from './crypto.ts';

export interface Identity {
  readonly userId: string;
  readonly signPublic: Uint8Array;
  readonly boxPublic: Uint8Array;
  readonly signPrivate: CryptoKey;
  readonly boxPrivate: CryptoKey;
}

/** A user id is a hash of the signing key, so an id cannot be claimed by another key. */
export async function userIdOf(signPublic: Uint8Array): Promise<string> {
  return toHex((await sha256(signPublic)).subarray(0, 16));
}

/**
 * Keys are extractable so the identity can be backed up and moved to another device. Script in
 * the page could misuse a non-extractable key just the same.
 */
export async function newIdentity(): Promise<Identity> {
  const sign = (await subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const box = (await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
  const signPublic = new Uint8Array(await subtle.exportKey('raw', sign.publicKey));
  const boxPublic = new Uint8Array(await subtle.exportKey('raw', box.publicKey));
  return {
    userId: await userIdOf(signPublic),
    signPublic,
    boxPublic,
    signPrivate: sign.privateKey,
    boxPrivate: box.privateKey,
  };
}

export async function sign(identity: Identity, message: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.sign('Ed25519', identity.signPrivate, buf(message)));
}

export async function verify(signPublic: Uint8Array, message: Uint8Array, sig: Uint8Array) {
  try {
    const key = await subtle.importKey('raw', buf(signPublic), 'Ed25519', false, ['verify']);
    return await subtle.verify('Ed25519', key, buf(sig), buf(message));
  } catch {
    return false;
  }
}

/** What a login signs. Prefixed so a login signature can never pass as a commit's. */
export function loginMessage(nonce: string): Uint8Array {
  return utf8(`bezier-sync-login:${nonce}`);
}

/**
 * Wraps a keyring for one member: an ephemeral X25519 exchange with their public key,
 * HKDF, AES-GCM. The recipient id is bound in, so a wrapped key cannot be replayed onto
 * someone else's membership.
 */
export async function wrapFor(secret: Uint8Array, boxPublic: Uint8Array, recipient: string) {
  const eph = (await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
  const theirs = await subtle.importKey('raw', buf(boxPublic), 'X25519', false, []);
  const shared = new Uint8Array(
    await subtle.deriveBits({ name: 'X25519', public: theirs }, eph.privateKey, 256),
  );
  const ephPublic = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
  const key = await hkdf(concat(shared, ephPublic, boxPublic), `bezier-sync/wrap/${recipient}`);
  return toB64(concat(ephPublic, await gcmSeal(key, randomBytes(12), secret, 'wrap')));
}

export async function unwrap(identity: Identity, wrapped: Uint8Array): Promise<Uint8Array> {
  const ephPublic = wrapped.subarray(0, 32);
  const eph = await subtle.importKey('raw', buf(ephPublic), 'X25519', false, []);
  const shared = new Uint8Array(
    await subtle.deriveBits({ name: 'X25519', public: eph }, identity.boxPrivate, 256),
  );
  const info = `bezier-sync/wrap/${identity.userId}`;
  const key = await hkdf(concat(shared, ephPublic, identity.boxPublic), info);
  return gcmOpen(key, wrapped.subarray(32), 'wrap');
}

/**
 * Invite links. The secret lives in the URL fragment, which browsers never send to a
 * server. The server gets only a hash of a token derived from it, enough to check a claim,
 * not enough to open the keyring it is holding for the invitee.
 */
export async function inviteMaterial(secret: Uint8Array) {
  const token = await hkdf(secret, 'bezier-sync/invite-token');
  return {
    token: toB64(token),
    tokenHash: toHex(await sha256(token)),
    key: await hkdf(secret, 'bezier-sync/invite-key'),
  };
}

export async function sealInvite(secret: Uint8Array, keyring: Uint8Array): Promise<string> {
  const { key } = await inviteMaterial(secret);
  return toB64(await gcmSeal(key, randomBytes(12), keyring, 'invite'));
}

export async function openInvite(secret: Uint8Array, payload: Uint8Array): Promise<Uint8Array> {
  const { key } = await inviteMaterial(secret);
  return gcmOpen(key, payload, 'invite');
}

// Keeping an identity.

interface ExportedIdentity {
  sign: [string, string];
  box: [string, string];
}

/** An identity as text. Whoever holds this is the user, so it is never uploaded. */
export async function exportIdentity(identity: Identity): Promise<string> {
  const pkcs8 = async (key: CryptoKey) =>
    toB64(new Uint8Array(await subtle.exportKey('pkcs8', key)));
  const out: ExportedIdentity = {
    sign: [toB64(identity.signPublic), await pkcs8(identity.signPrivate)],
    box: [toB64(identity.boxPublic), await pkcs8(identity.boxPrivate)],
  };
  return JSON.stringify(out);
}

export async function importIdentity(text: string): Promise<Identity> {
  const parsed = JSON.parse(text) as ExportedIdentity;
  const signPublic = fromB64(parsed.sign[0]);
  const boxPublic = fromB64(parsed.box[0]);
  const signPrivate = await subtle.importKey(
    'pkcs8',
    buf(fromB64(parsed.sign[1])),
    'Ed25519',
    true,
    ['sign'],
  );
  const boxPrivate = await subtle.importKey('pkcs8', buf(fromB64(parsed.box[1])), 'X25519', true, [
    'deriveBits',
  ]);
  return { userId: await userIdOf(signPublic), signPublic, boxPublic, signPrivate, boxPrivate };
}

/**
 * OWASP's 2023 figure for PBKDF2-SHA256. A backup may sit in cloud storage for years, so
 * guessing must be slow; about a second on a phone is acceptable once per device.
 */
const BACKUP_ITERATIONS = 600_000;

async function backupKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await subtle.importKey('raw', buf(utf8(passphrase)), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** A backup file's content: the identity sealed under a passphrase. */
export async function backupIdentity(identity: Identity, passphrase: string): Promise<string> {
  if (passphrase.length < 10) throw new Error('Choose a passphrase of at least 10 characters.');
  const salt = randomBytes(16);
  const key = await backupKey(passphrase, salt, BACKUP_ITERATIONS);
  const sealed = await gcmSeal(
    key,
    randomBytes(12),
    utf8(await exportIdentity(identity)),
    'backup',
  );
  return JSON.stringify({
    kind: 'bezier-sync-identity',
    userId: identity.userId,
    iterations: BACKUP_ITERATIONS,
    salt: toB64(salt),
    sealed: toB64(sealed),
  });
}

export async function restoreIdentity(file: string, passphrase: string): Promise<Identity> {
  const parsed = JSON.parse(file) as {
    kind?: string;
    iterations: number;
    salt: string;
    sealed: string;
  };
  if (parsed.kind !== 'bezier-sync-identity') throw new Error('This is not an identity backup.');
  const key = await backupKey(passphrase, fromB64(parsed.salt), parsed.iterations);
  let text: string;
  try {
    text = fromUtf8(await gcmOpen(key, fromB64(parsed.sealed), 'backup'));
  } catch {
    throw new Error('The passphrase is not right.');
  }
  return importIdentity(text);
}
