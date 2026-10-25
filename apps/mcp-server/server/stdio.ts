/**
 * MCP over stdio: one JSON message per line in, one per line out. All other output goes to
 * stderr, since a stray line on stdout is a protocol error for the client.
 */

import { createInterface } from 'node:readline';
import type { McpServer } from './protocol.ts';

export function serveStdio(server: McpServer): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
  lines.on('line', (line) => {
    if (line.trim() === '') return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Not JSON.' } })}\n`,
      );
      return;
    }
    void server.handle(message).then((reply) => {
      if (reply !== null) process.stdout.write(`${JSON.stringify(reply)}\n`);
    });
  });
  lines.on('close', () => process.exit(0));
}
