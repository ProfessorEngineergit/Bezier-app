/**
 * The link between this server and a running Bezier window.
 *
 * The window dials out, since a browser tab cannot be reached and a listening desktop app would be
 * reachable by every page the user opens. After the pairing code is entered in Settings, the
 * window opens an event stream (`GET /app/events`), receives requests on it and posts each answer
 * to `POST /app/reply`.
 *
 * The pairing code is the only authorisation: without it nothing reaches the window and no reply
 * is accepted. It is compared in constant time, sent only to 127.0.0.1 unless configured
 * otherwise, and regenerated on each start unless BEZIER_MCP_CODE is set.
 *
 * The window decides what it answers (apps/studio/src/automation/) and refuses unknown methods.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** What the window may be asked. The window holds the same list and refuses anything else. */
export type AppMethod =
  | 'status'
  | 'project'
  | 'selection'
  | 'screenshot'
  | 'ui'
  | 'settings.read'
  | 'settings.write'
  | 'performance';

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** 25 MB: a 2x screenshot of a large window, base64, with room to spare. */
const MAX_REPLY = 25_000_000;
const KEEPALIVE_MS = 15_000;

export interface AppInfo {
  connectedAt: string;
  version: string;
  origin: string;
}

export class AppLink {
  readonly code: string;
  private stream: ServerResponse | null = null;
  private info: AppInfo | null = null;
  private next = 1;
  private readonly waiting = new Map<number, Waiting>();
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private readonly origins: readonly string[];
  private readonly log: (line: string) => void;

  constructor(
    code: string | undefined,
    origins: readonly string[],
    log: (line: string) => void = () => {},
  ) {
    this.code = code ?? newCode();
    this.origins = origins;
    this.log = log;
  }

  get connected(): AppInfo | null {
    return this.info;
  }

  /** Asks the window and waits for its answer, or for `ms` to pass. */
  call(method: AppMethod, params: Record<string, unknown> = {}, ms = 20_000): Promise<unknown> {
    const stream = this.stream;
    if (stream === null) {
      return Promise.reject(
        new Error(
          'No Bezier window is connected. Ask the person to open Bezier, go to Settings, MCP & Automation, ' +
            `and enter the pairing code ${this.code}.`,
        ),
      );
    }
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`Bezier did not answer ${method} within ${ms / 1000} s.`));
      }, ms);
      this.waiting.set(id, { resolve, reject, timer });
      stream.write(`event: request\ndata: ${JSON.stringify({ id, method, params })}\n\n`);
    });
  }

  /** Handles `/app/*`; returns false for any other path so the caller can go on. */
  route(request: IncomingMessage, response: ServerResponse, path: string): boolean {
    if (!path.startsWith('/app/')) return false;
    const origin = request.headers.origin ?? '';
    if (!this.allowedOrigin(origin)) {
      response.writeHead(403).end();
      return true;
    }
    response.setHeader('Access-Control-Allow-Origin', origin === '' ? '*' : origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        // Chrome asks before a public page reaches a loopback address; this is the yes.
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
      });
      response.end();
      return true;
    }
    const url = new URL(path, 'http://local');
    if (request.method === 'GET' && url.pathname === '/app/events') {
      this.open(request, response, url, origin);
      return true;
    }
    if (request.method === 'POST' && url.pathname === '/app/reply') {
      void this.reply(request, response);
      return true;
    }
    response.writeHead(404).end();
    return true;
  }

  close(): void {
    this.drop('The server stopped.');
  }

  private open(request: IncomingMessage, response: ServerResponse, url: URL, origin: string): void {
    // EventSource cannot send headers, so the code comes in the query, over loopback.
    if (!this.matches(url.searchParams.get('code') ?? '')) {
      response.writeHead(401).end();
      return;
    }
    // One window at a time; the newest is the one the user is looking at.
    this.drop('Another Bezier window connected.');
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    response.write('event: hello\ndata: {}\n\n');
    this.stream = response;
    this.info = {
      connectedAt: new Date().toISOString(),
      version: (url.searchParams.get('version') ?? 'unknown').slice(0, 40),
      origin: origin || 'desktop',
    };
    this.log(`app connected (${this.info.origin}, Bezier ${this.info.version})`);
    this.keepalive = setInterval(() => response.write(': keepalive\n\n'), KEEPALIVE_MS);
    request.on('close', () => {
      if (this.stream !== response) return;
      this.drop('The Bezier window disconnected.');
      this.log('app disconnected');
    });
  }

  private async reply(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const auth = request.headers.authorization ?? '';
    if (!this.matches(auth.replace(/^Bearer /, ''))) {
      response.writeHead(401).end();
      return;
    }
    let body: { id?: unknown; ok?: unknown; value?: unknown; error?: unknown };
    try {
      body = JSON.parse(await readBody(request, MAX_REPLY)) as typeof body;
    } catch {
      response.writeHead(400).end();
      return;
    }
    response.writeHead(204).end();
    const waiting = typeof body.id === 'number' ? this.waiting.get(body.id) : undefined;
    if (waiting === undefined || typeof body.id !== 'number') return;
    this.waiting.delete(body.id);
    clearTimeout(waiting.timer);
    if (body.ok === true) waiting.resolve(body.value);
    else waiting.reject(new Error(typeof body.error === 'string' ? body.error : 'Refused.'));
  }

  private drop(reason: string): void {
    if (this.keepalive !== null) clearInterval(this.keepalive);
    this.keepalive = null;
    this.stream?.end();
    this.stream = null;
    this.info = null;
    for (const [id, waiting] of this.waiting) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error(reason));
      this.waiting.delete(id);
    }
  }

  private matches(given: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(this.code);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** The desktop app, a development server on this machine, and what the operator listed. */
  private allowedOrigin(origin: string): boolean {
    if (origin === '') return true;
    if (this.origins.includes('*') || this.origins.includes(origin)) return true;
    return /^(?:tauri:\/\/localhost|https?:\/\/tauri\.localhost|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/.test(
      origin,
    );
  }
}

/** Eight letters and digits in two groups, without the ones people misread (0/O, 1/I/L). */
export function newCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i += 1) code += alphabet[(bytes[i] ?? 0) % alphabet.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function readBody(request: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error('Too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
