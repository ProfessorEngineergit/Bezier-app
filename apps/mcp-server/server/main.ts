/**
 * Bezier's MCP server.
 *
 *   node apps/mcp-server/server/main.ts          for an MCP client on this machine, over stdio
 *   node apps/mcp-server/server/main.ts --http   on a machine of your own, over Streamable HTTP at /mcp
 *
 *   BEZIER_MCP_PORT     where the Bezier window connects, and /mcp with --http (default 7357)
 *   BEZIER_MCP_HOST     address to listen on (default 127.0.0.1)
 *   BEZIER_MCP_CODE     a fixed pairing code for the window; a new one each start if unset
 *   BEZIER_MCP_TOKEN    with --http: the bearer token clients send (32+ characters, required)
 *   BEZIER_MCP_ORIGINS  browser origins allowed besides the desktop app and localhost, by ','
 *
 * The pairing code is printed to stderr and returned by `app_connect`, so the assistant can tell
 * the user what to type into Bezier.
 */

import { AppLink } from './app-link.ts';
import { loadDocs } from './docs.ts';
import { createHttp } from './http.ts';
import { McpServer } from './protocol.ts';
import { serveStdio } from './stdio.ts';
import { catalogue } from './tools.ts';

const env = process.env;
const overHttp = process.argv.includes('--http');
const port = Number(env.BEZIER_MCP_PORT ?? 7357);
const host = env.BEZIER_MCP_HOST ?? '127.0.0.1';
const origins = (env.BEZIER_MCP_ORIGINS ?? '').split(',').filter((o) => o !== '');
const log = (line: string) => process.stderr.write(`[bezier-mcp] ${line}\n`);

const token = env.BEZIER_MCP_TOKEN ?? '';
if (overHttp && token.length < 32) {
  // Over HTTP the server can be reached by more than this machine; it must never be open.
  log('BEZIER_MCP_TOKEN must be set to at least 32 characters with --http.');
  process.exit(2);
}
if (!overHttp && host !== '127.0.0.1' && host !== 'localhost') {
  log('Without --http the window line stays on this machine; BEZIER_MCP_HOST is ignored.');
}

const app = new AppLink(env.BEZIER_MCP_CODE || undefined, origins, log);
const mcp = new McpServer({
  ...catalogue(loadDocs(), app),
  onCall: (tool, ok, ms) => log(`${tool} ${ok ? 'ok' : 'failed'} in ${ms} ms`),
});

const http = createHttp({ app, mcp: overHttp ? { server: mcp, token, origins } : null });
http.listen(port, overHttp ? host : '127.0.0.1', () => {
  log(`Bezier windows connect to http://127.0.0.1:${port} with the pairing code ${app.code}`);
  if (overHttp) log(`MCP clients connect to http://${host}:${port}/mcp with the token`);
});
http.on('error', (error) => {
  log(`Could not listen on ${port}: ${error.message}. Set BEZIER_MCP_PORT to another port.`);
  if (overHttp) process.exit(1);
});
if (!overHttp) serveStdio(mcp);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close();
    http.close();
    process.exit(0);
  });
}
