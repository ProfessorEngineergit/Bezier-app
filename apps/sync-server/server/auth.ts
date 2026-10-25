/**
 * Who is calling. There are no passwords: a user is a public key, and logging in is
 * signing a fresh nonce with the private half, which never leaves the device. So a
 * leaked server database holds nothing to log in with, and nothing to crack.
 *
 * Sessions live in memory. A restart logs everyone out, and every client logs in again
 * by itself on the next 401, so there is nothing to persist or leak.
 */

import { fromB64, isHexId, toB64, toHex } from '../protocol/bytes.ts';
import { randomBytes, sha256 } from '../protocol/crypto.ts';
import { loginMessage, userIdOf, verify } from '../protocol/identity.ts';
import type { PublicUser } from '../protocol/wire.ts';
import type { Store } from './store.ts';

const CHALLENGE_MS = 60_000;
const SESSION_MS = 12 * 60 * 60_000;

/** Bounded so a client asking for nonces in a loop cannot grow the server's memory. */
const MAX_CHALLENGES = 10_000;

export class HttpError extends Error {
  readonly status: number;
  readonly detail: string | undefined;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export class Auth {
  readonly #store: Store;
  readonly #challenges = new Map<string, number>();
  readonly #sessions = new Map<string, { userId: string; expires: number }>();

  constructor(store: Store) {
    this.#store = store;
  }

  async register(signPublicB64: string, boxPublicB64: string): Promise<PublicUser> {
    const signPublic = fromB64(signPublicB64);
    const boxPublic = fromB64(boxPublicB64);
    if (signPublic.length !== 32 || boxPublic.length !== 32) {
      throw new HttpError(400, 'Those are not valid public keys.');
    }
    const user: PublicUser = {
      userId: await userIdOf(signPublic),
      signPublic: signPublicB64,
      boxPublic: boxPublicB64,
    };
    const existing = await this.user(user.userId);
    // Registering again with the same keys is a harmless retry. A different box key under the
    // same signing key would let whoever registered first redirect shares, so it is refused.
    if (existing !== null && existing.boxPublic !== user.boxPublic) {
      throw new HttpError(409, 'This identity is already registered with a different key.');
    }
    if (existing === null) await this.#store.writeJson(`users/${user.userId}.json`, user);
    return user;
  }

  async user(userId: string): Promise<PublicUser | null> {
    if (!isHexId(userId, 32)) return null;
    return this.#store.readJson<PublicUser>(`users/${userId}.json`);
  }

  challenge(): string {
    this.#sweep();
    if (this.#challenges.size >= MAX_CHALLENGES) {
      throw new HttpError(429, 'Too many logins at once. Try again in a minute.');
    }
    const nonce = toB64(randomBytes(32));
    this.#challenges.set(nonce, Date.now() + CHALLENGE_MS);
    return nonce;
  }

  async session(userId: string, nonce: string, signature: string) {
    const expires = this.#challenges.get(nonce);
    // One use per nonce, whatever the outcome, so a captured signature cannot be replayed.
    this.#challenges.delete(nonce);
    if (expires === undefined || expires < Date.now()) {
      throw new HttpError(401, 'The login took too long. Try again.');
    }
    const user = await this.user(userId);
    if (user === null) throw new HttpError(401, 'This server does not know you yet.');
    const ok = await verify(fromB64(user.signPublic), loginMessage(nonce), fromB64(signature));
    if (!ok) throw new HttpError(401, 'The login could not be verified.');

    const token = toB64(randomBytes(32));
    const until = Date.now() + SESSION_MS;
    // Kept hashed, so a memory dump does not hand out live sessions.
    this.#sessions.set(await tokenKey(token), { userId, expires: until });
    return { token, expiresAt: new Date(until).toISOString() };
  }

  /** The user behind an `Authorization: Bearer` header, or a 401. */
  async require(header: string | undefined): Promise<string> {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (token === undefined) throw new HttpError(401, 'Please log in.');
    const session = this.#sessions.get(await tokenKey(token));
    if (session === undefined || session.expires < Date.now()) {
      throw new HttpError(401, 'Your session has ended. Please log in again.');
    }
    return session.userId;
  }

  #sweep(): void {
    const now = Date.now();
    for (const [nonce, expires] of this.#challenges)
      if (expires < now) this.#challenges.delete(nonce);
    for (const [key, s] of this.#sessions) if (s.expires < now) this.#sessions.delete(key);
  }
}

async function tokenKey(token: string): Promise<string> {
  return toHex(await sha256(new TextEncoder().encode(token)));
}
