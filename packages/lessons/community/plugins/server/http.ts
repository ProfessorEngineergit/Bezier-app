/**
 * The plugin API, version 1 (community/plugins/README.md).
 *
 * Reading is public; uploading needs an operator-issued token. Approving, rejecting and revoking
 * are only possible from the local CLI (cli.ts), so nothing reachable over the network can publish
 * code.
 */

import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { HttpError, httpKit } from '../../server/http-kit.js';
import { RateLimiter } from '../../server/rate-limit.js';
import { compareVersions, PLUGIN_ID, PLUGIN_LIMITS } from '../format/manifest.js';
import type { PluginConfig } from './config.js';
import { Refused, reviewUpload } from './review.js';
import type { PluginStore } from './store.js';

const PAGE = 24;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

export function createPluginApp(
  config: PluginConfig,
  store: PluginStore,
  blocklist: readonly string[],
): Server {
  const uploads = new RateLimiter(20, 3_600_000);
  const reports = new RateLimiter(20, 3_600_000);
  const reads = new RateLimiter(600, 60_000);
  const { clientKey, headers, json, body, preflight, serve } = httpKit(config);
  const tooLarge = `Plugin packages may be at most ${PLUGIN_LIMITS.packageBytes / 1000} KB.`;

  function author(req: IncomingMessage) {
    const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization ?? '');
    const found = match?.[1] === undefined ? null : store.findAuthor(match[1]);
    if (found === null)
      throw new HttpError(401, 'This server needs an upload token. Ask its owner for one.');
    return found;
  }

  async function upload(req: IncomingMessage, res: ServerResponse) {
    if (!uploads.take(clientKey(req)))
      throw new HttpError(429, 'Too many uploads from here. Try again in an hour.');
    const who = author(req);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    if (store.uploadsSince(who.id, since) >= who.dailyLimit) {
      throw new HttpError(
        429,
        `You can upload ${who.dailyLimit} versions a day. Try again tomorrow.`,
      );
    }
    const reviewed = await reviewUpload(
      await body(req, PLUGIN_LIMITS.packageBytes, tooLarge),
      blocklist,
    );
    const { manifest } = reviewed.plugin;
    const owner = store.owner(manifest.id);
    if (owner !== null && owner !== who.id) {
      throw new HttpError(
        409,
        `The id “${manifest.id}” belongs to another author. Choose another id.`,
      );
    }
    const newer = store
      .versions(manifest.id)
      .find((v) => compareVersions(v, manifest.pluginVersion) >= 0);
    if (newer !== undefined) {
      throw new HttpError(409, `Version ${newer} was already uploaded. Raise the version number.`);
    }
    await store.insert(who, manifest, reviewed.bytes, reviewed.findings);
    json(req, res, 202, { id: manifest.id, version: manifest.pluginVersion, status: 'pending' });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (req.method === 'OPTIONS') return preflight(req, res);
    if (path === '/v1/health' && req.method === 'GET') return json(req, res, 200, { ok: true });
    if (req.method === 'GET' && !reads.take(clientKey(req)))
      throw new HttpError(429, 'Slow down a little.');
    if (path === '/v1/info' && req.method === 'GET') {
      const info = {
        name: config.name,
        description: config.description,
        kind: 'plugins',
        uploads: true,
      };
      return json(req, res, 200, info, 'public, max-age=300');
    }
    if (path === '/v1/plugins' && req.method === 'POST') return upload(req, res);
    if (path === '/v1/plugins' && req.method === 'GET') {
      const cursor = url.searchParams.get('cursor');
      const before = cursor === null ? Number.MAX_SAFE_INTEGER : Number(cursor);
      if (!Number.isSafeInteger(before) || before < 1) throw new HttpError(400, 'Unknown page.');
      const q = (url.searchParams.get('q') ?? '').slice(0, 80);
      const page = store.list(q, url.searchParams.get('offline') === '1', before, PAGE);
      const result = {
        plugins: page.plugins,
        ...(page.next === undefined ? {} : { next: page.next }),
      };
      return json(req, res, 200, result, 'public, max-age=30');
    }
    if (path === '/v1/mine' && req.method === 'GET') {
      const rows = store.byAuthor(author(req).id);
      const plugins = rows.map((r) => ({
        id: r.plugin,
        version: r.version,
        status: r.status,
        note: r.note,
      }));
      return json(req, res, 200, { plugins });
    }
    const match =
      /^\/v1\/plugins\/([a-z0-9.-]{3,64})(?:\/(report)|\/versions\/([0-9.]{5,20})\/package)?$/.exec(
        path,
      );
    const id = match?.[1];
    if (id === undefined || !PLUGIN_ID.test(id)) throw new HttpError(404, 'There is nothing here.');
    const [, , report, version] = match ?? [];
    if (report === undefined && version === undefined && req.method === 'GET') {
      // Short cache: installed copies learn about revocations from this response.
      return json(req, res, 200, store.detail(id), 'public, max-age=60');
    }
    if (version !== undefined && VERSION.test(version) && req.method === 'GET') {
      const entry = store.approvedVersion(id, version);
      if (entry === null) throw new HttpError(404, 'There is no such plugin version.');
      res.writeHead(
        200,
        headers(req, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(entry.size),
          'Cache-Control': 'public, max-age=3600',
          ETag: `"${entry.sha256}"`,
          'Content-Disposition': 'attachment; filename="plugin.bezierplugin"',
        }),
      );
      res.end(await store.readPackage(entry.sha256));
      return;
    }
    if (report !== undefined && req.method === 'POST') {
      if (!reports.take(clientKey(req))) throw new HttpError(429, 'Too many reports from here.');
      const raw = Buffer.from(await body(req, 2_000, 'Keep the reason short.')).toString('utf8');
      let reason = '';
      try {
        const value = (JSON.parse(raw) as { reason?: unknown } | null)?.reason;
        reason = typeof value === 'string' ? value : '';
      } catch {
        throw new HttpError(400, 'Send the reason as JSON.');
      }
      await store.report(id, clientKey(req), reason, config.reportThreshold);
      return json(req, res, 202, { ok: true });
    }
    throw new HttpError(404, 'There is nothing here.');
  }

  return serve(route, (error) => (error instanceof Refused ? 422 : null));
}
