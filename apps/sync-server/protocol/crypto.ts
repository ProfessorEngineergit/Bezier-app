/**
 * The end-to-end encryption of a vault's content. The server stores what this file
 * produces and can read none of it: not the models, not project or branch names, not
 * commit messages. See ../DESIGN.md, "What the server learns". Identities, key wrapping
 * and invites are in identity.ts.
 *
 * Everything is WebCrypto: AES-256-GCM, HMAC-SHA-256, HKDF, X25519, Ed25519 and PBKDF2.
 * No hand-written primitives.
 */

import { buf, concat, fromB64, fromUtf8, toB64, toHex, utf8 } from './bytes.ts';

export const subtle = globalThis.crypto.subtle;

/**
 * The first byte of everything sealed. Bumped if a sealed format changes, so an old
 * client refuses instead of misreading. 2 added the key epoch.
 */
const FORMAT = 2;

export function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest('SHA-256', buf(data)));
}

export async function hkdf(secret: Uint8Array, info: string, length = 32): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', buf(secret), 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: buf(utf8(info)) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle.importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await subtle.sign('HMAC', k, buf(data)));
}

/**
 * AES-256-GCM with a small header: format byte, two bytes of key epoch, twelve of nonce.
 * The header is also the associated data, so changing the epoch byte breaks the tag
 * instead of silently selecting another key.
 */
export async function gcmSeal(
  key: Uint8Array,
  nonce: Uint8Array,
  plain: Uint8Array,
  purpose: string,
  epoch = 0,
): Promise<Uint8Array> {
  const header = concat(Uint8Array.of(FORMAT, epoch >> 8, epoch & 0xff), nonce);
  const aes = await subtle.importKey('raw', buf(key), 'AES-GCM', false, ['encrypt']);
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv: buf(nonce), additionalData: buf(concat(header, utf8(purpose))) },
    aes,
    buf(plain),
  );
  return concat(header, new Uint8Array(ct));
}

/** The epoch a sealed value says it was sealed under, after checking the format byte. */
export function epochOf(sealed: Uint8Array): number {
  if (sealed[0] !== FORMAT) {
    throw new Error(`This was written by a different version of Bezier sync (${sealed[0]}).`);
  }
  return ((sealed[1] ?? 0) << 8) | (sealed[2] ?? 0);
}

export async function gcmOpen(key: Uint8Array, sealed: Uint8Array, purpose: string) {
  epochOf(sealed);
  const header = sealed.subarray(0, 15);
  const aes = await subtle.importKey('raw', buf(key), 'AES-GCM', false, ['decrypt']);
  const plain = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: buf(sealed.subarray(3, 15)),
      additionalData: buf(concat(header, utf8(purpose))),
    },
    aes,
    buf(sealed.subarray(15)),
  );
  return new Uint8Array(plain);
}

// The keyring: one root key per epoch. A new epoch begins when a member is removed, so
// what is written afterwards is sealed with a key they never had (DESIGN.md, "Revocation").

export interface EpochKeys {
  readonly epoch: number;
  readonly root: Uint8Array;
  readonly encrypt: Uint8Array;
  readonly nonce: Uint8Array;
  readonly names: Uint8Array;
}

export interface Keyring {
  /** Index is the epoch. Old epochs stay, to read what was written under them. */
  readonly epochs: readonly EpochKeys[];
  /** The newest epoch: everything new is sealed with it. */
  readonly current: EpochKeys;
}

async function epochKeys(epoch: number, root: Uint8Array): Promise<EpochKeys> {
  return {
    epoch,
    root,
    encrypt: await hkdf(root, 'bezier-sync/encrypt'),
    nonce: await hkdf(root, 'bezier-sync/nonce'),
    names: await hkdf(root, 'bezier-sync/names'),
  };
}

export async function keyringOf(roots: readonly Uint8Array[]): Promise<Keyring> {
  if (roots.length === 0) throw new Error('A keyring needs at least one key.');
  const epochs = await Promise.all(roots.map((root, i) => epochKeys(i, root)));
  const current = epochs[epochs.length - 1];
  if (current === undefined) throw new Error('A keyring needs at least one key.');
  return { epochs, current };
}

export function newKeyring(): Promise<Keyring> {
  return keyringOf([randomBytes(32)]);
}

/** The same keyring with one more epoch on top. */
export function rotated(ring: Keyring): Promise<Keyring> {
  return keyringOf([...ring.epochs.map((e) => e.root), randomBytes(32)]);
}

/** What is wrapped for a member or sealed into an invite: every epoch's root. */
export function serializeKeyring(ring: Keyring): Uint8Array {
  return utf8(JSON.stringify(ring.epochs.map((e) => toB64(e.root))));
}

export function parseKeyring(bytes: Uint8Array): Promise<Keyring> {
  const roots = JSON.parse(fromUtf8(bytes)) as unknown;
  if (!Array.isArray(roots) || roots.some((r) => typeof r !== 'string')) {
    throw new Error('The vault key could not be read.');
  }
  return keyringOf(roots.map((r: string) => fromB64(r)));
}

function keysFor(ring: Keyring, sealed: Uint8Array): EpochKeys {
  const keys = ring.epochs[epochOf(sealed)];
  if (keys === undefined) throw new Error('This was sealed with a key this device does not have.');
  return keys;
}

/**
 * Seals an immutable object deterministically: the nonce is an HMAC of the plaintext (a
 * synthetic IV), so equal content seals to equal bytes and the object id can be the SHA-256 of
 * the ciphertext. Unchanged chunks are stored once, and the server can verify (scrub, repair)
 * objects it cannot read. The server learns which objects in a vault are equal, which
 * deduplication reveals anyway.
 */
export async function sealObject(
  ring: Keyring,
  plain: Uint8Array,
): Promise<{ id: string; sealed: Uint8Array }> {
  const keys = ring.current;
  const nonce = (await hmac(keys.nonce, plain)).subarray(0, 12);
  const sealed = await gcmSeal(keys.encrypt, nonce, plain, 'object', keys.epoch);
  return { id: toHex(await sha256(sealed)), sealed };
}

export async function openObject(ring: Keyring, id: string, sealed: Uint8Array) {
  // Checked before decrypting: a server that swaps objects between ids is caught here.
  if (toHex(await sha256(sealed)) !== id) throw new Error(`Object ${id} does not match its id.`);
  return gcmOpen(keysFor(ring, sealed).encrypt, sealed, 'object');
}

/** Seals a mutable value (a branch head, vault metadata) with a random nonce. */
export async function sealValue(ring: Keyring, value: unknown, purpose: string) {
  const keys = ring.current;
  const plain = utf8(JSON.stringify(value));
  return gcmSeal(keys.encrypt, randomBytes(12), plain, purpose, keys.epoch);
}

export async function openValue(ring: Keyring, sealed: Uint8Array, purpose: string) {
  const plain = await gcmOpen(keysFor(ring, sealed).encrypt, sealed, purpose);
  return JSON.parse(fromUtf8(plain)) as unknown;
}

/**
 * The server-visible id of a branch: keyed, so the server cannot guess "main". Always
 * the first epoch's key, so a branch keeps its id across rotations. A removed member can
 * therefore still recognise a branch id they knew; they cannot read where it points.
 */
export async function refId(ring: Keyring, name: string): Promise<string> {
  const first = ring.epochs[0] ?? ring.current;
  return toHex((await hmac(first.names, utf8(`ref:${name}`))).subarray(0, 16));
}
