/**
 * `bezier-plugin dev`: serves the plugin folder to the local Bezier window and notifies it of file
 * changes so the plugin reloads on save. Loopback only, and only the plugin's two files; the window
 * validates the manifest and runs the code in the plugin sandbox.
 */

import { readFileSync, watch } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';

const FILES: Record<string, string> = {
  '/plugin.json': 'application/json',
  '/main.js': 'text/javascript',
};

export function devServer(dir: string, onChange: (file: string) => void = () => {}): Server {
  const listeners = new Set<ServerResponse>();
  let pending: ReturnType<typeof setTimeout> | null = null;
  const watcher = watch(dir, (_, file) => {
    if (file !== 'plugin.json' && file !== 'main.js') return;
    // Editors write a file in several steps; reload once per save.
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => {
      onChange(file);
      for (const response of listeners) response.write(`event: change\ndata: ${file}\n\n`);
    }, 80);
  });

  const server = createServer((request, response) => {
    const origin = request.headers.origin ?? '';
    // Allow the local browser editor or the desktop app, not arbitrary web pages.
    if (
      origin !== '' &&
      !/^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|tauri:\/\/localhost|https?:\/\/tauri\.localhost)$/.test(
        origin,
      )
    ) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin || '*');
    response.setHeader('Cache-Control', 'no-store');
    const path = new URL(request.url ?? '/', 'http://local').pathname;
    if (path === '/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('event: hello\ndata: {}\n\n');
      listeners.add(response);
      request.on('close', () => listeners.delete(response));
      return;
    }
    const type = FILES[path];
    if (type === undefined) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = readFileSync(join(dir, path.slice(1)));
      response.writeHead(200, { 'Content-Type': type }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  server.on('close', () => {
    watcher.close();
    for (const response of listeners) response.end();
  });
  return server;
}
