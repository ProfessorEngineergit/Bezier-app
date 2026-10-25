/**
 * The API routes (listed in ../protocol/wire.ts). Each handler gets the authenticated
 * caller; the dispatcher in http.ts has already checked the session for every route not
 * in `PUBLIC`, before any body is read.
 */

import type { IncomingMessage } from 'node:http';
import { isHexId } from '../protocol/bytes.ts';
import type {
  ClaimRequest,
  CreateVaultRequest,
  HealthResponse,
  InviteRequest,
  LiveCheckpoint,
  LivePost,
  MemberRequest,
  MissingRequest,
  PresenceRequest,
  RefUpdate,
  RegisterRequest,
  RotateRequest,
  SessionRequest,
  ViewRequest,
} from '../protocol/wire.ts';
import { type Auth, HttpError } from './auth.ts';
import type { Live } from './live.ts';
import { manifest } from './mirror.ts';
import type { Presence } from './presence.ts';
import type { Refs } from './refs.ts';
import type { Store } from './store.ts';
import type { Vaults } from './vaults.ts';
import type { Views } from './views.ts';

export const VERSION = '0.3.0';

export type Handler = (req: IncomingMessage, params: string[], user: string) => Promise<unknown>;

/**
 * Who may call a route, checked by the dispatcher before the handler runs and before any
 * body is read:
 *   session  a logged-in member (the default)
 *   public   anyone; these are the rate-limited ones
 *   view     a member, or a read-only link (`X-Bezier-View`); `user` is then `view:<token>`
 *   mirror   a mirror server with the mirror token, and nobody else
 */
export type Access = 'session' | 'public' | 'view' | 'mirror';

export type Route = [method: string, pattern: RegExp, handler: Handler, access: Access];

/** The 409 a lost compare-and-swap answers with, carrying what is there now. */
export class Conflict extends Error {
  readonly current: unknown;
  constructor(current: unknown) {
    super('conflict');
    this.current = current;
  }
}

export interface RouteDeps {
  store: Store;
  auth: Auth;
  vaults: Vaults;
  refs: Refs;
  views: Views;
  presence: Presence;
  live: Live;
  enrollmentCode: string | undefined;
  maxObjectBytes: number;
  json: <T>(req: IncomingMessage) => Promise<T>;
  raw: (req: IncomingMessage, limit: number) => Promise<Uint8Array>;
}

const V = '/v1/vaults/([0-9a-f]{32})';
const USER = '([0-9a-f]{32})';
const CH = '([0-9a-f]{32})';

export function routes(d: RouteDeps): Route[] {
  const { store, auth, vaults, refs, views, presence, live, json } = d;
  const r = (method: string, path: string, handler: Handler, access: Access = 'session'): Route => [
    method,
    new RegExp(`^${path}$`),
    handler,
    access,
  ];
  /** Read access: a member, or the holder of a read-only link to this vault. */
  const read = async (v: string, user: string): Promise<void> => {
    if (user.startsWith('view:')) await viewOf(v, user);
    else await vaults.require(v, user, 'reader');
  };
  /** The link a `view:<vault>.<token>` caller holds, if it is for vault `v`. */
  const viewOf = async (v: string | null, user: string) => {
    const [vault = '', token = ''] = user.slice(5).split('.');
    if (v !== null && vault !== v) throw new HttpError(404, 'No such vault.');
    return views.require(vault, token);
  };

  return [
    r(
      'GET',
      '/v1/health',
      async (): Promise<HealthResponse> => ({
        ok: store.replicas.every((x) => x.ok),
        version: VERSION,
        // Health only; paths stay in the server's log.
        replicas: store.replicas.map((x) => ({ ok: x.ok })),
      }),
      'public',
    ),

    r(
      'POST',
      '/v1/users',
      async (req) => {
        const body = await json<RegisterRequest>(req);
        const byCode = d.enrollmentCode !== undefined && body.enrollment === d.enrollmentCode;
        const byInvite =
          body.invite !== undefined &&
          (await vaults.invite(body.invite.vault, body.invite.token)) !== null;
        if (!byCode && !byInvite) {
          throw new HttpError(403, 'Joining this server needs an invite or the enrollment code.');
        }
        return auth.register(body.signPublic, body.boxPublic);
      },
      'public',
    ),
    // Public keys, to check signatures with; a read-only link may ask too, so what it shows
    // can say who signed it.
    r(
      'GET',
      `/v1/users/${USER}`,
      async (_req, [id = ''], user) => {
        if (user.startsWith('view:')) await viewOf(null, user);
        const found = await auth.user(id);
        if (found === null) throw new HttpError(404, 'No such user on this server.');
        return found;
      },
      'view',
    ),
    r('POST', '/v1/auth/challenge', async () => ({ nonce: auth.challenge() }), 'public'),
    r(
      'POST',
      '/v1/auth/session',
      async (req) => {
        const body = await json<SessionRequest>(req);
        return auth.session(body.userId, body.nonce, body.signature);
      },
      'public',
    ),

    r('GET', '/v1/vaults', async (_req, _p, user) => ({ vaults: await vaults.listFor(user) })),
    r('POST', '/v1/vaults', async (req, _p, user) => {
      const body = await json<CreateVaultRequest>(req);
      return { vault: await vaults.create(user, body.wrappedKey, body.meta) };
    }),
    r('GET', V, async (_req, [v = ''], user) => vaults.detail(v, user)),
    r('DELETE', V, async (_req, [v = ''], user) => {
      await vaults.remove(v, user);
      live.forget(v);
      return {};
    }),
    r('PUT', `${V}/meta`, async (req, [v = ''], user) => {
      await vaults.setMeta(v, user, (await json<{ meta: string }>(req)).meta);
      return {};
    }),
    r('PUT', `${V}/profile`, async (req, [v = ''], user) => {
      await vaults.setProfile(v, user, (await json<{ profile: string }>(req)).profile);
      return {};
    }),
    r('PUT', `${V}/members/${USER}`, async (req, [v = '', u = ''], user) => {
      // Admin first, so a non-admin cannot probe which user ids exist.
      await vaults.require(v, user, 'admin');
      if ((await auth.user(u)) === null) throw new HttpError(404, 'No such user on this server.');
      await vaults.setMember(v, user, u, await json<MemberRequest>(req));
      return {};
    }),
    r('DELETE', `${V}/members/${USER}`, async (_req, [v = '', u = ''], user) => {
      await vaults.removeMember(v, user, u);
      presence.forget(v, u);
      return {};
    }),
    r('POST', `${V}/rotate`, async (req, [v = ''], user) => {
      await vaults.rotate(v, user, await json<RotateRequest>(req));
      return {};
    }),
    r('PUT', `${V}/protected`, async (req, [v = ''], user) => {
      await vaults.setProtected(v, user, (await json<{ refs: string[] }>(req)).refs);
      return {};
    }),

    r('POST', `${V}/invites`, async (req, [v = ''], user) => {
      await vaults.createInvite(v, user, await json<InviteRequest>(req));
      return {};
    }),
    r('DELETE', `${V}/invites/([0-9a-f]{64})`, async (_req, [v = '', hash = ''], user) => {
      await vaults.withdrawInvite(v, user, hash);
      return {};
    }),
    r('POST', `${V}/invites/open`, async (req, [v = '']) => {
      const invite = await vaults.invite(v, (await json<{ token: string }>(req)).token);
      if (invite === null) throw new HttpError(404, 'This invite is not valid any more.');
      return { payload: invite.payload, role: invite.role };
    }),
    r('POST', `${V}/invites/claim`, async (req, [v = ''], user) => {
      const body = await json<ClaimRequest>(req);
      return { role: await vaults.claim(v, user, body.token, body.wrappedKey) };
    }),

    r('POST', `${V}/objects/missing`, async (req, [v = ''], user) => {
      await vaults.require(v, user, 'reader');
      const { ids } = await json<MissingRequest>(req);
      if (!Array.isArray(ids)) throw new HttpError(400, 'Expected a list of ids.');
      const missing: string[] = [];
      for (const id of ids.slice(0, 10_000)) {
        if (isHexId(id, 64) && !(await store.hasObject(v, id))) missing.push(id);
      }
      return { missing };
    }),
    r('PUT', `${V}/objects/([0-9a-f]{64})`, async (req, [v = '', id = ''], user) => {
      await vaults.require(v, user, 'writer');
      const data = await d.raw(req, d.maxObjectBytes);
      let result: 'stored' | 'exists' | 'mismatch' = 'mismatch';
      await vaults.charge(v, data.length, async () => {
        result = await store.putObject(v, id, data);
        return result === 'stored';
      });
      if (result === 'mismatch') {
        throw new HttpError(400, 'The upload was damaged on the way. Try again.');
      }
      return {};
    }),
    r(
      'GET',
      `${V}/objects/([0-9a-f]{64})`,
      async (_req, [v = '', id = ''], user) => {
        await read(v, user);
        const data = await store.getObject(v, id);
        if (data === null) throw new HttpError(404, 'This server does not have that object.');
        return data;
      },
      'view',
    ),

    r(
      'GET',
      `${V}/refs`,
      async (_req, [v = ''], user) => {
        await read(v, user);
        return { refs: await refs.list(v) };
      },
      'view',
    ),
    r('PUT', `${V}/refs/([0-9a-f]{32})`, async (req, [v = '', ref = ''], user) => {
      const role = await vaults.require(v, user, 'writer');
      const body = await json<RefUpdate>(req);
      const result = await refs.move(v, role, ref, body.ifMatch, body.value);
      if (!result.ok) throw new Conflict(result.current);
      return result.entry;
    }),
    r('DELETE', `${V}/refs/([0-9a-f]{32})`, async (req, [v = '', ref = ''], user) => {
      const role = await vaults.require(v, user, 'writer');
      const { ifMatch } = await json<{ ifMatch: string }>(req);
      const result = await refs.move(v, role, ref, ifMatch, null);
      if (!result.ok) throw new Conflict(result.current);
      return {};
    }),

    r('GET', `${V}/presence`, async (_req, [v = ''], user) => {
      await vaults.require(v, user, 'reader');
      return { presence: presence.list(v) };
    }),
    r('PUT', `${V}/presence/([0-9a-f]{32})`, async (req, [v = '', device = ''], user) => {
      await vaults.require(v, user, 'reader');
      const body = await json<PresenceRequest>(req);
      presence.beat(v, user, device, body.sealed, body.ttl);
      return {};
    }),
    r('DELETE', `${V}/presence/([0-9a-f]{32})`, async (_req, [v = '', device = ''], user) => {
      await vaults.require(v, user, 'reader');
      presence.leave(v, user, device);
      return {};
    }),

    r(
      'GET',
      `${V}/live/${CH}`,
      async (req, [v = '', ch = ''], user) => {
        await read(v, user);
        const query = new URL(req.url ?? '/', 'http://x').searchParams;
        const after = Math.max(0, Math.floor(Number(query.get('after')) || 0));
        return live.read(v, ch, after, query.get('wait') === '1', query.get('fresh') === '1');
      },
      'view',
    ),
    r('POST', `${V}/live/${CH}`, async (req, [v = '', ch = ''], user) => {
      await vaults.require(v, user, 'writer');
      return { seq: await live.append(v, ch, user, await json<LivePost>(req)) };
    }),
    r('PUT', `${V}/live/${CH}/checkpoint`, async (req, [v = '', ch = ''], user) => {
      await vaults.require(v, user, 'writer');
      await live.checkpoint(v, ch, await json<LiveCheckpoint>(req));
      return {};
    }),

    r('POST', `${V}/views`, async (req, [v = ''], user) => {
      await views.create(v, user, await json<ViewRequest>(req));
      return {};
    }),
    r('DELETE', `${V}/views/([0-9a-f]{64})`, async (_req, [v = '', hash = ''], user) => {
      await views.withdraw(v, user, hash);
      return {};
    }),
    r(
      'POST',
      `${V}/views/open`,
      async (_req, [v = ''], user) => {
        if (!user.startsWith('view:')) throw new HttpError(400, 'Open a link with its token.');
        return { payload: (await viewOf(v, user)).payload };
      },
      'view',
    ),

    r('GET', '/v1/mirror/manifest', async () => manifest(store), 'mirror'),
    r(
      'GET',
      `/v1/mirror/vaults/([0-9a-f]{32})/objects/([0-9a-f]{64})`,
      async (_req, [v = '', id = '']) => {
        const data = await store.getObject(v, id);
        if (data === null) throw new HttpError(404, 'This server does not have that object.');
        return data;
      },
      'mirror',
    ),
  ];
}
