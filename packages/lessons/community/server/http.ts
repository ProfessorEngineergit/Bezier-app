/**
 * The community API, version 1. community/README.md is the contract.
 *
 * Reading is public; uploading needs an operator-issued token. There is no admin API: approving,
 * rejecting and removing are only possible from the local CLI (server/cli.ts).
 */

import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { ID_PATTERN, LIMITS } from '../client/limits.js';
import type { Config } from './config.js';
import { HttpError, httpKit } from './http-kit.js';
import { inspectUpload, Rejected } from './inspect.js';
import { RateLimiter } from './rate-limit.js';
import { screenPackage } from './screen.js';
import type { Store } from './store.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const PAGE = 24;
/** Concurrent inspections; packages are held in memory while checked. */
const MAX_INSPECTIONS = 2;

export function createApp(config: Config, store: Store, blocklist: readonly string[]): Server {
  const uploads = new RateLimiter(10, 3_600_000);
  const reports = new RateLimiter(20, 3_600_000);
  const reads = new RateLimiter(600, 60_000);
  let inspecting = 0;
  const { clientKey, headers, json, body: readBody, preflight, serve } = httpKit(config);
  const tooLarge = (max: number) => `Packages may be at most ${Math.floor(max / 1_000_000)} MB.`;
  const body = (req: IncomingMessage, max: number) => readBody(req, max, tooLarge(max));

  function account(req: IncomingMessage) {
    const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization ?? '');
    const found = match?.[1] === undefined ? null : store.findAccount(match[1]);
    if (found === null)
      throw new HttpError(401, 'This server needs an upload token. Ask its owner for one.');
    return found;
  }

  async function upload(req: IncomingMessage, res: ServerResponse) {
    if (!uploads.take(clientKey(req)))
      throw new HttpError(429, 'Too many uploads from here. Try again in an hour.');
    const who = account(req);
    const today = new Date(Date.now() - 86_400_000).toISOString();
    if (store.uploadsSince(who.id, today) >= who.dailyLimit) {
      throw new HttpError(
        429,
        `You can upload ${who.dailyLimit} lessons a day. Try again tomorrow.`,
      );
    }
    if (inspecting >= MAX_INSPECTIONS) {
      res.setHeader('Retry-After', '30');
      throw new HttpError(503, 'The server is checking other uploads. Try again in a minute.');
    }
    inspecting += 1;
    try {
      const bytes = await body(req, config.maxUploadBytes);
      const id = randomBytes(16).toString('hex');
      const {
        manifest,
        bytes: normalised,
        contentHash,
      } = await inspectUpload(bytes, id, blocklist);
      if (!(await screenPackage(config.screenCommand, normalised))) {
        throw new Rejected('This lesson did not pass the server’s content check.');
      }
      if (store.hasContent(contentHash))
        throw new Rejected('This lesson has already been uploaded.');
      await store.insert(who, manifest, normalised, contentHash);
      json(req, res, 202, { id, status: 'pending' });
    } finally {
      inspecting -= 1;
    }
  }

  function list(req: IncomingMessage, res: ServerResponse, url: URL) {
    const q = (url.searchParams.get('q') ?? '').slice(0, 80);
    const level = url.searchParams.get('level') ?? undefined;
    if (level !== undefined && !LEVELS.includes(level)) throw new HttpError(400, 'Unknown level.');
    const cursor = url.searchParams.get('cursor');
    const before = cursor === null ? Number.MAX_SAFE_INTEGER : Number(cursor);
    if (!Number.isSafeInteger(before) || before < 1) throw new HttpError(400, 'Unknown page.');
    const page = store.listApproved(q, level, before, PAGE);
    json(
      req,
      res,
      200,
      { lessons: page.lessons, ...(page.next === undefined ? {} : { next: page.next }) },
      'public, max-age=30',
    );
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (req.method === 'OPTIONS') return preflight(req, res);
    if (path === '/v1/health' && req.method === 'GET') return json(req, res, 200, { ok: true });
    if (path === '/v1/info' && req.method === 'GET') {
      const info = {
        name: config.name,
        description: config.description,
        uploads: true,
        limits: LIMITS,
      };
      return json(req, res, 200, info, 'public, max-age=300');
    }
    if (req.method === 'GET' && !reads.take(clientKey(req)))
      throw new HttpError(429, 'Slow down a little.');

    if (path === '/v1/lessons') {
      if (req.method === 'GET') return list(req, res, url);
      if (req.method === 'POST') return upload(req, res);
    }
    if (path === '/v1/mine' && req.method === 'GET') {
      const who = account(req);
      const mine = store
        .byAccount(who.id)
        .map((l) => ({ id: l.id, title: l.title, status: l.status, note: l.note }));
      return json(req, res, 200, { lessons: mine });
    }
    const match = /^\/v1\/lessons\/([0-9a-f]{32})(\/package|\/report)?$/.exec(path);
    const id = match?.[1];
    if (id !== undefined && ID_PATTERN.test(id)) {
      const entry = store.getApproved(id);
      if (match?.[2] === undefined && req.method === 'GET') {
        if (entry === null) throw new HttpError(404, 'There is no such lesson.');
        return json(req, res, 200, entry, 'public, max-age=60');
      }
      if (match?.[2] === '/package' && req.method === 'GET') {
        if (entry === null) throw new HttpError(404, 'There is no such lesson.');
        if (req.headers['if-none-match'] === `"${entry.sha256}"`) {
          res.writeHead(304, headers(req)).end();
          return;
        }
        res.writeHead(
          200,
          headers(req, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(entry.size),
            // Content-addressed, so never stale; one hour keeps takedowns effective quickly.
            'Cache-Control': 'public, max-age=3600',
            ETag: `"${entry.sha256}"`,
            'Content-Disposition': 'attachment; filename="lesson.bezierlesson"',
          }),
        );
        createReadStream(store.path(entry.sha256))
          .on('error', () => res.destroy())
          .pipe(res);
        return;
      }
      if (match?.[2] === '/report' && req.method === 'POST') {
        if (!reports.take(clientKey(req))) throw new HttpError(429, 'Too many reports from here.');
        const raw = await body(req, 2_000);
        let reason = '';
        try {
          const parsed: unknown = JSON.parse(Buffer.from(raw).toString('utf8'));
          const value = (parsed as { reason?: unknown } | null)?.reason;
          reason = typeof value === 'string' ? value : '';
        } catch {
          throw new HttpError(400, 'Send the reason as JSON.');
        }
        await store.report(id, clientKey(req), reason, config.reportThreshold);
        // Same response whether or not the lesson exists, so reports cannot probe for pending ones.
        return json(req, res, 202, { ok: true });
      }
    }
    throw new HttpError(404, 'There is nothing here.');
  }

  return serve(route, (error) => (error instanceof Rejected ? 422 : null));
}
