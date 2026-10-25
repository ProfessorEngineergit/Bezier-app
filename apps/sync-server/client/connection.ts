/**
 * The connection to one server: login and the raw calls everything else builds on. Sealing
 * happens in vault-client.ts and repository.ts. Needs only `fetch` and WebCrypto, so it runs
 * in browsers, workers, Tauri's webview and Node.
 */

import { toB64 } from '../protocol/bytes.ts';
import { type Identity, loginMessage, sign } from '../protocol/identity.ts';
import type { ErrorBody, PublicUser, RefEntry, SessionResponse } from '../protocol/wire.ts';

/** A failed request, with a human-readable message and the HTTP status. */
export class SyncError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type RegisterProof = { enrollment: string } | { invite: { vault: string; token: string } };

export class Connection {
  readonly baseUrl: string;
  readonly identity: Identity;
  readonly #fetch: typeof fetch;
  #token: string | null = null;
  readonly #users = new Map<string, PublicUser>();

  /**
   * Set when this connection reads through a read-only link instead of an account: every
   * request carries the link's token, and none logs in.
   */
  readonly view: { vault: string; token: string } | null;

  /** `baseUrl` empty means the page's own origin, which is how the web app talks to its server. */
  constructor(
    baseUrl: string,
    identity: Identity,
    fetchImpl: typeof fetch = fetch,
    options: { view?: { vault: string; token: string } } = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.identity = identity;
    this.view = options.view ?? null;
    // Wrapped, because a browser's fetch throws when called as a method of another object.
    this.#fetch = (input, init) => fetchImpl(input, init);
  }

  /** Makes this identity known to the server. Needs the enrollment code or an invite. */
  async register(proof: RegisterProof): Promise<void> {
    await this.call(
      'POST',
      '/v1/users',
      {
        signPublic: toB64(this.identity.signPublic),
        boxPublic: toB64(this.identity.boxPublic),
        ...proof,
      },
      false,
    );
  }

  async login(): Promise<void> {
    const { nonce } = (await this.call('POST', '/v1/auth/challenge', {}, false)) as {
      nonce: string;
    };
    const signature = await sign(this.identity, loginMessage(nonce));
    const session = (await this.call(
      'POST',
      '/v1/auth/session',
      { userId: this.identity.userId, nonce, signature: toB64(signature) },
      false,
    )) as SessionResponse;
    this.#token = session.token;
  }

  /** Whether this identity is known to the server: a login attempt, nothing else. */
  async isRegistered(): Promise<boolean> {
    try {
      await this.login();
      return true;
    } catch (error) {
      if (error instanceof SyncError && error.status === 401) return false;
      throw error;
    }
  }

  async user(userId: string): Promise<PublicUser> {
    const known = this.#users.get(userId);
    if (known !== undefined) return known;
    const user = (await this.call('GET', `/v1/users/${userId}`)) as PublicUser;
    this.#users.set(userId, user);
    return user;
  }

  // Objects and refs, already sealed.

  async missing(vault: string, ids: readonly string[]): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < ids.length; i += 5000) {
      const body = { ids: ids.slice(i, i + 5000) };
      const res = (await this.call('POST', `/v1/vaults/${vault}/objects/missing`, body)) as {
        missing: string[];
      };
      out.push(...res.missing);
    }
    return out;
  }

  async putObject(vault: string, id: string, sealed: Uint8Array): Promise<void> {
    await this.call('PUT', `/v1/vaults/${vault}/objects/${id}`, sealed);
  }

  async getObject(vault: string, id: string): Promise<Uint8Array> {
    return (await this.call('GET', `/v1/vaults/${vault}/objects/${id}`)) as Uint8Array;
  }

  async refs(vault: string): Promise<RefEntry[]> {
    return ((await this.call('GET', `/v1/vaults/${vault}/refs`)) as { refs: RefEntry[] }).refs;
  }

  /** Moves a ref if it is still at `ifMatch`. On a race returns what is there instead. */
  async moveRef(
    vault: string,
    ref: string,
    ifMatch: string | null,
    value: Uint8Array | null,
  ): Promise<{ ok: true; entry: RefEntry | null } | { ok: false; current: RefEntry | null }> {
    try {
      const entry =
        value === null
          ? await this.call('DELETE', `/v1/vaults/${vault}/refs/${ref}`, { ifMatch })
          : await this.call('PUT', `/v1/vaults/${vault}/refs/${ref}`, {
              ifMatch,
              value: toB64(value),
            });
      return { ok: true, entry: entry as RefEntry | null };
    } catch (error) {
      if (error instanceof SyncError && error.status === 409) {
        return { ok: false, current: (error.body as { current: RefEntry | null }).current };
      }
      throw error;
    }
  }

  /** One API call, logging in first and once more if the session ended. */
  async call(
    method: string,
    path: string,
    body?: unknown,
    authed = true,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const viewing = authed && this.view !== null;
    if (authed && !viewing && this.#token === null) await this.login();
    const send = () =>
      this.#fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(viewing && this.view !== null
            ? { 'X-Bezier-View': `${this.view.vault}.${this.view.token}` }
            : {}),
          ...(authed && !viewing && this.#token !== null
            ? { Authorization: `Bearer ${this.#token}` }
            : {}),
          'Content-Type':
            body instanceof Uint8Array ? 'application/octet-stream' : 'application/json',
        },
        ...(body === undefined
          ? {}
          : { body: body instanceof Uint8Array ? body.slice() : JSON.stringify(body) }),
        ...(signal === undefined ? {} : { signal }),
      });
    let res: Response;
    try {
      res = await send();
      // Sessions end when the server restarts; one fresh login is the expected path.
      if (res.status === 401 && authed && !viewing) {
        await this.login();
        res = await send();
      }
    } catch (error) {
      if (error instanceof SyncError || signal?.aborted === true) throw error;
      throw new SyncError(
        0,
        'The server cannot be reached. Your work stays on this device.',
        error,
      );
    }
    const type = res.headers.get('Content-Type') ?? '';
    const data: unknown = type.startsWith('application/octet-stream')
      ? new Uint8Array(await res.arrayBuffer())
      : await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (data as Partial<ErrorBody>).message ?? `The server answered ${res.status}.`;
      throw new SyncError(res.status, message, data);
    }
    return data;
  }
}
