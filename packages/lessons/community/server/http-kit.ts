/**
 * Shared HTTP helpers for all community servers: security headers, CORS for allowed origins, JSON
 * with ETags, size-checked bodies and one-sentence errors.
 */

import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** An HTTP error whose message is shown to the user. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface KitOptions {
  origins: string[];
  trustProxy: boolean;
}

export function httpKit({ origins, trustProxy }: KitOptions) {
  const clientKey = (req: IncomingMessage): string => {
    const forwarded = req.headers['x-forwarded-for'];
    // Use the rightmost entry, appended by our own proxy; earlier ones are client-supplied.
    const last = typeof forwarded === 'string' ? forwarded.split(',').pop()?.trim() : undefined;
    return trustProxy && last ? last : (req.socket.remoteAddress ?? 'unknown');
  };

  const headers = (req: IncomingMessage, extra: Record<string, string> = {}) => {
    const origin = req.headers.origin;
    const allowed = origin !== undefined && origins.includes(origin);
    const wildcard = origins.includes('*') && req.method === 'GET';
    return {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ...(allowed && origin !== undefined
        ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
        : wildcard
          ? { 'Access-Control-Allow-Origin': '*' }
          : {}),
      ...extra,
    };
  };

  const json = (
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    body: unknown,
    cache = 'no-store',
  ) => {
    const payload = JSON.stringify(body);
    const etag = `"${createHash('sha256').update(payload).digest('base64url').slice(0, 22)}"`;
    if (status === 200 && req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers(req, { ETag: etag })).end();
      return;
    }
    res
      .writeHead(
        status,
        headers(req, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': cache,
          ...(status === 200 && cache !== 'no-store' ? { ETag: etag } : {}),
        }),
      )
      .end(payload);
  };

  /** Reads the body, rejecting an oversized Content-Length up front and stopping at `max` bytes. */
  const body = async (req: IncomingMessage, max: number, tooLarge: string): Promise<Uint8Array> => {
    const declared = Number(req.headers['content-length']);
    if (!Number.isFinite(declared) || declared <= 0) {
      throw new HttpError(411, 'Send the upload with a Content-Length.');
    }
    if (declared > max) throw new HttpError(413, tooLarge);
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      received += chunk.byteLength;
      // Count the bytes; Content-Length may lie.
      if (received > max) throw new HttpError(413, tooLarge);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };

  const preflight = (req: IncomingMessage, res: ServerResponse): void => {
    res
      .writeHead(
        204,
        headers(req, {
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '86400',
        }),
      )
      .end();
  };

  /**
   * Creates a server. An HttpError, or an error mapped by `refusal`, is returned as its message;
   * anything else is logged and becomes a 500.
   */
  const serve = (
    route: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>,
    refusal: (error: unknown) => number | null = () => null,
  ): Server => {
    const server = createServer((req, res) => {
      route(req, res).catch((error: unknown) => {
        if (res.headersSent) return res.destroy();
        const status = error instanceof HttpError ? error.status : refusal(error);
        if (status !== null && error instanceof Error) {
          // The rest of an oversized body is not read, so close the connection.
          if (status === 413) res.setHeader('Connection', 'close');
          return json(req, res, status, { error: error.message });
        }
        console.error('Unhandled error in', req.method, req.url, error);
        json(req, res, 500, { error: 'Something went wrong on the server.' });
      });
    });
    server.headersTimeout = 15_000;
    server.requestTimeout = 10 * 60_000;
    server.keepAliveTimeout = 5_000;
    server.maxConnections = 256;
    return server;
  };

  return { clientKey, headers, json, body, preflight, serve };
}
