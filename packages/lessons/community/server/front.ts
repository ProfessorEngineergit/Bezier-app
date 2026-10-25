/**
 * A single address for the community store: routes `/lessons/…`, `/plugins/…` etc. to the
 * matching server by stripping the first path segment. Each server keeps its own data, limits and
 * review (http.ts in each folder).
 */

import { createServer, type Server } from 'node:http';

export function createFront(parts: Readonly<Record<string, Server>>): Server {
  return createServer((request, response) => {
    const url = request.url ?? '/';
    for (const [name, server] of Object.entries(parts)) {
      const prefix = `/${name}`;
      if (url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`)) {
        request.url = url.slice(prefix.length) || '/';
        server.emit('request', request, response);
        return;
      }
    }
    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'There is nothing at this address.' }));
  });
}
