/**
 * The HTTP server: dispatch, limits, headers. Routes are in routes.ts. Plain `node:http`, with
 * no dependencies, so it can run for years without updates.
 *
 * TLS is terminated in front (Caddy or Tailscale, ../deploy/). Without it models stay sealed,
 * but session tokens and traffic shape would be exposed, so the deploy files always add it.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ErrorBody } from '../protocol/wire.ts';
import { Auth, HttpError } from './auth.ts';
import { Live } from './live.ts';
import { requireMirror } from './mirror.ts';
import { Presence } from './presence.ts';
import { Refs } from './refs.ts';
import { Conflict, routes } from './routes.ts';
import type { Store } from './store.ts';
import { Vaults } from './vaults.ts';
import { Views } from './views.ts';

export { VERSION } from './routes.ts';

export interface ServerOptions {
  store: Store;
  /** Lets a new user register without an invite. Unset means invites only. */
  enrollmentCode?: string;
  /** Other origins the app may be served from, for CORS (the desktop app, a dev server). */
  allowedOrigins?: readonly string[];
  /** Largest object accepted, in bytes. The client chunks below this. */
  maxObjectBytes?: number;
  /** Bytes of sealed objects one vault may hold. Unset means no limit. */
  quotaBytes?: number;
  /** Requests per minute per address before login routes answer 429. */
  publicRateLimit?: number;
  /**
   * Take the caller's address from `X-Forwarded-For`. Only behind a proxy that sets it,
   * like the Caddy in ../deploy; otherwise anyone could pick their own address and the
   * rate limit would mean nothing.
   */
  trustProxy?: boolean;
  /** Lets a mirror server copy everything (mirror.ts). Unset means no mirror can. */
  mirrorToken?: string;
}

export function createSyncServer(options: ServerOptions) {
  const { store } = options;
  const auth = new Auth(store);
  const vaults = new Vaults(store, options.quotaBytes ?? null);
  const refs = new Refs(store, vaults);
  const table = routes({
    store,
    auth,
    vaults,
    refs,
    views: new Views(vaults),
    presence: new Presence(),
    live: new Live(store),
    enrollmentCode: options.enrollmentCode,
    maxObjectBytes: options.maxObjectBytes ?? 16 * 1024 * 1024,
    json,
    raw,
  });
  const limiter = new RateLimiter(options.publicRateLimit ?? 60);

  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    cors(req, res, options.allowedOrigins ?? []);
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    try {
      if (!path.startsWith('/v1/'))
        throw new HttpError(404, 'Nothing here. Open this server from Bezier.');
      for (const [method, pattern, handler, access] of table) {
        const match = req.method === method ? pattern.exec(path) : null;
        if (match === null) continue;
        let user = '';
        if (access === 'public') {
          // Only public routes are rate-limited; that is where guessing happens.
          if (!limiter.allow(address(req, options.trustProxy === true))) {
            throw new HttpError(429, 'Too many attempts. Wait a minute and try again.');
          }
        } else if (access === 'mirror') {
          await requireMirror(req.headers.authorization, options.mirrorToken);
        } else {
          const view = req.headers['x-bezier-view'];
          // A link's header is `<vault>.<token>`: the vault is checked against the route's,
          // so a link to one vault never reads another.
          user =
            access === 'view' && typeof view === 'string' && req.headers.authorization === undefined
              ? `view:${view}`
              : await auth.require(req.headers.authorization);
        }
        return send(res, 200, await handler(req, match.slice(1), user));
      }
      throw new HttpError(404, 'Nothing here.');
    } catch (error) {
      if (error instanceof Conflict) return send(res, 409, { current: error.current });
      if (error instanceof HttpError) {
        const body: ErrorBody = { message: error.message };
        if (error.detail !== undefined) body.detail = error.detail;
        return send(res, error.status, body);
      }
      // The client gets a message; the stack goes to the log.
      console.error(error);
      return send(res, 500, { message: 'The server ran into a problem. Your data is unchanged.' });
    }
  });
}

/** A fixed one-minute window per address. Crude, and enough to make guessing slow. */
class RateLimiter {
  readonly #limit: number;
  #window = 0;
  readonly #counts = new Map<string, number>();

  constructor(limit: number) {
    this.#limit = limit;
  }

  allow(key: string): boolean {
    const window = Math.floor(Date.now() / 60_000);
    if (window !== this.#window) {
      this.#window = window;
      this.#counts.clear();
    }
    const count = (this.#counts.get(key) ?? 0) + 1;
    this.#counts.set(key, count);
    return count <= this.#limit;
  }
}

function address(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? '';
  return req.socket.remoteAddress ?? '';
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  if (body instanceof Uint8Array) {
    res.writeHead(status, { 'Content-Type': 'application/octet-stream' }).end(body);
  } else {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body ?? {}));
  }
}

function cors(req: IncomingMessage, res: ServerResponse, allowed: readonly string[]): void {
  const origin = req.headers.origin;
  if (origin === undefined || !(allowed.includes(origin) || allowed.includes('*'))) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Bezier-View');
  res.setHeader('Access-Control-Max-Age', '600');
}

async function raw(req: IncomingMessage, limit: number): Promise<Uint8Array> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) {
      throw new HttpError(413, `That is larger than this server accepts (${limit} bytes).`);
    }
    parts.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(parts));
}

async function json<T>(req: IncomingMessage): Promise<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(await raw(req, 1024 * 1024)));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The request could not be read.', String(error));
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new HttpError(400, 'The request could not be read.');
  }
  return parsed as T;
}
