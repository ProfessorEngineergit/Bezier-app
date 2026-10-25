/**
 * The wiki API, version 1.
 *
 * Reading is public. Writing needs an operator-issued token, and changes go live immediately.
 * Every version is kept; restoring an earlier one is recorded as a new change.
 */

import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { HttpError, httpKit } from '../../server/http-kit.js';
import { RateLimiter } from '../../server/rate-limit.js';
import { LIMITS } from '../format/article.js';
import { Refused, readSubmission } from './check.js';
import type { DocsConfig } from './config.js';
import { type DocsStore, publicArticle } from './store.js';

const PAGE = 24;
const HASH = /^[0-9a-f]{64}$/;
/** Maximum request body: every picture as base64 plus the text. */
const MAX_BODY = (LIMITS.images * LIMITS.imageBytes * 4) / 3 + LIMITS.body * 4;

export function createDocsApp(
  config: DocsConfig,
  store: DocsStore,
  blocklist: readonly string[],
): Server {
  const writes = new RateLimiter(40, 3_600_000);
  const reads = new RateLimiter(900, 60_000);
  const { clientKey, headers, json, body, preflight, serve } = httpKit(config);

  function account(req: IncomingMessage) {
    const match = /^Bearer ([A-Za-z0-9_-]{16,100})$/.exec(req.headers.authorization ?? '');
    const found = match?.[1] === undefined ? null : store.findAccount(match[1]);
    if (found === null)
      throw new HttpError(
        401,
        'This store needs a token to write articles. Ask its owner for one.',
      );
    return found;
  }

  const parse = async (req: IncomingMessage): Promise<unknown> => {
    const bytes = await body(req, MAX_BODY, 'That article is too large to send.');
    try {
      return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
    } catch {
      throw new HttpError(400, 'That is not an article.');
    }
  };

  async function submit(req: IncomingMessage, res: ServerResponse) {
    if (!writes.take(clientKey(req)))
      throw new HttpError(429, 'Too many articles from here. Try again later.');
    const who = account(req);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    if (who.role !== 'reviewer' && store.submittedSince(who.id, since) >= who.dailyLimit)
      throw new HttpError(
        429,
        `You can send ${who.dailyLimit} articles a day. Try again tomorrow.`,
      );
    let submitted: ReturnType<typeof readSubmission>;
    try {
      submitted = readSubmission(await parse(req), blocklist);
    } catch (error) {
      if (error instanceof Refused) throw new HttpError(422, error.message);
      throw error;
    }
    const { id } = submitted.article;
    const { seq, status } = await store.submit(who, submitted.article, submitted.images);
    json(req, res, 201, { id, seq, status });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (req.method === 'OPTIONS') return preflight(req, res);
    if (path === '/v1/health' && req.method === 'GET') return json(req, res, 200, { ok: true });
    if (req.method === 'GET' && !reads.take(clientKey(req)))
      throw new HttpError(429, 'Slow down a little.');

    if (path === '/v1/info' && req.method === 'GET')
      return json(
        req,
        res,
        200,
        { name: config.name, description: config.description, kind: 'docs', uploads: true },
        'public, max-age=300',
      );
    if (path === '/v1/me' && req.method === 'GET') {
      const who = account(req);
      return json(req, res, 200, { name: who.name, role: who.role });
    }
    if (path === '/v1/mine' && req.method === 'GET') {
      const articles = store.byAccount(account(req).id).map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        note: s.note,
      }));
      return json(req, res, 200, { articles });
    }
    if (path === '/v1/docs' && req.method === 'POST') return submit(req, res);
    if (path === '/v1/docs' && req.method === 'GET') {
      const cursor = url.searchParams.get('cursor');
      const before = cursor === null ? Number.MAX_SAFE_INTEGER : Number(cursor);
      if (!Number.isSafeInteger(before) || before < 1) throw new HttpError(400, 'Unknown page.');
      const page = store.list((url.searchParams.get('q') ?? '').slice(0, 80), before, PAGE);
      return json(
        req,
        res,
        200,
        {
          articles: page.articles.map(publicArticle),
          ...(page.next === undefined ? {} : { next: page.next }),
        },
        'public, max-age=30',
      );
    }
    const doc = /^\/v1\/docs\/([a-z0-9-]{1,60})$/.exec(path);
    if (doc?.[1] !== undefined && req.method === 'GET') {
      const live = store.live(doc[1]);
      if (live === null) throw new HttpError(404, 'There is no such article.');
      return json(req, res, 200, publicArticle(live), 'public, max-age=60');
    }
    const history = /^\/v1\/docs\/([a-z0-9-]{1,60})\/history$/.exec(path);
    if (history?.[1] !== undefined && req.method === 'GET')
      return json(req, res, 200, { versions: store.history(history[1]) }, 'public, max-age=10');
    const version = /^\/v1\/docs\/([a-z0-9-]{1,60})\/versions\/(\d{1,12})$/.exec(path);
    if (version?.[1] !== undefined && version[2] !== undefined && req.method === 'GET') {
      const found = store.revision(version[1], Number(version[2]));
      if (found === null) throw new HttpError(404, 'There is no such version.');
      return json(req, res, 200, publicArticle(found), 'public, max-age=3600');
    }
    const restore = /^\/v1\/docs\/([a-z0-9-]{1,60})\/restore$/.exec(path);
    if (restore?.[1] !== undefined && req.method === 'POST') {
      const who = account(req);
      if (!writes.take(clientKey(req))) throw new HttpError(429, 'Too many changes from here.');
      const sent = (await parse(req)) as { seq?: unknown } | null;
      const done = typeof sent?.seq === 'number' ? store.restore(who, restore[1], sent.seq) : null;
      if (done === null) throw new HttpError(404, 'There is no such version.');
      return json(req, res, 201, { id: restore[1], seq: done.seq, status: 'approved' });
    }
    const picture = /^\/v1\/images\/([0-9a-f]{64})$/.exec(path);
    if (picture?.[1] !== undefined && HASH.test(picture[1]) && req.method === 'GET') {
      const found = await store.picture(picture[1]);
      if (found === null) throw new HttpError(404, 'There is no such picture.');
      res.writeHead(
        200,
        headers(req, {
          'Content-Type': found.mime,
          'Content-Length': String(found.bytes.byteLength),
          'Cache-Control': 'public, max-age=31536000, immutable',
          ETag: `"${picture[1]}"`,
        }),
      );
      res.end(found.bytes);
      return;
    }
    throw new HttpError(404, 'There is nothing here.');
  }

  return serve((req, res) => route(req, res));
}
