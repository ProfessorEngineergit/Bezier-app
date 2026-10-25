/**
 * One HTTP listener: `/app/*` for the Bezier window (app-link.ts) and, with --http, `/mcp` for
 * MCP clients over Streamable HTTP. `/mcp` requires a bearer token and rejects browser origins
 * that are not listed, which blocks pages the user visits from calling it (DNS rebinding).
 *
 * Answers are plain JSON, never a stream: no tool sends progress and there is no session to resume.
 */

import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { type AppLink, readBody } from './app-link.ts';
import type { McpServer } from './protocol.ts';

export interface HttpOptions {
  app: AppLink;
  /** Serve MCP on /mcp; null leaves it out (stdio does that job). */
  mcp: { server: McpServer; token: string; origins: readonly string[] } | null;
}

const MAX_REQUEST = 1_000_000;

export function createHttp({ app, mcp }: HttpOptions): Server {
  return createServer((request, response) => {
    const path = request.url ?? '/';
    if (app.route(request, response, path)) return;
    if (mcp === null || !path.startsWith('/mcp')) {
      response.writeHead(404).end();
      return;
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !mcp.origins.includes(origin)) {
      response.writeHead(403).end();
      return;
    }
    if (!tokenMatches(request.headers.authorization ?? '', mcp.token)) {
      response.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' }).end();
      return;
    }
    void readBody(request, MAX_REQUEST)
      .then(async (body) => {
        const reply = await mcp.server.handle(JSON.parse(body));
        if (reply === null) {
          response.writeHead(202).end();
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(reply));
      })
      .catch(() => {
        if (!response.headersSent) response.writeHead(400).end();
      });
  });
}

function tokenMatches(header: string, token: string): boolean {
  const a = Buffer.from(header.replace(/^Bearer /, ''));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
