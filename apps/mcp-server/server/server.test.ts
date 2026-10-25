import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The real server, as a client starts it: a process speaking MCP on stdio. A stand-in for the
// Bezier window connects over the same line the app uses, so the whole way through is exercised.
const PORT = 7391;
const CODE = 'TEST-CODE';
let server: ChildProcess;
let next = 1;
const waiting = new Map<number, (reply: Record<string, unknown>) => void>();

function rpc(method: string, params: Record<string, unknown> = {}) {
  const id = next++;
  return new Promise<Record<string, unknown>>((resolve) => {
    waiting.set(id, resolve);
    server.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

const modern = { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } };

beforeAll(async () => {
  server = spawn(process.execPath, ['apps/mcp-server/server/main.ts'], {
    env: { ...process.env, BEZIER_MCP_PORT: String(PORT), BEZIER_MCP_CODE: CODE },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  createInterface({ input: server.stdout as NodeJS.ReadableStream }).on('line', (line) => {
    const reply = JSON.parse(line) as { id: number };
    waiting.get(reply.id)?.(reply as never);
  });
  await new Promise<void>((resolve) =>
    server.stderr?.on('data', (data: Buffer) => {
      if (data.toString().includes('pairing code')) resolve();
    }),
  );
});

afterAll(() => {
  server.kill();
});

/** A window that answers like Bezier does, over the app line. */
async function connectWindow(answer: (method: string, params: unknown) => unknown) {
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${PORT}/app/events?code=${CODE}&version=test`, {
    signal: controller.signal,
  });
  expect(response.status).toBe(200);
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      buffer += decoder.decode(value);
      let end = buffer.indexOf('\n\n');
      while (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf('\n\n');
        if (!block.startsWith('event: request')) continue;
        const request = JSON.parse(block.split('data: ')[1] ?? '{}') as {
          id: number;
          method: string;
          params: unknown;
        };
        await fetch(`http://127.0.0.1:${PORT}/app/reply`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${CODE}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: request.id,
            ok: true,
            value: answer(request.method, request.params),
          }),
        });
      }
    }
  })();
  return () => controller.abort();
}

describe('the MCP server', () => {
  it('answers a client of the stateless revision and an older one', async () => {
    const discover = (await rpc('server/discover', modern)).result as Record<string, unknown>;
    expect(discover.supportedVersions).toContain('2026-07-28');
    expect(discover.resultType).toBe('complete');
    const init = (await rpc('initialize', { protocolVersion: '2025-06-18' })).result as {
      protocolVersion: string;
    };
    expect(init.protocolVersion).toBe('2025-06-18');
    const refused = (await rpc('tools/list', {
      _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' },
    })) as { error: { code: number } };
    expect(refused.error.code).toBe(-32022);
  });

  it('lists its tools in the same order every time, with honest annotations', async () => {
    const first = (await rpc('tools/list', modern)).result as {
      tools: { name: string; annotations: { readOnlyHint: boolean } }[];
    };
    const second = (await rpc('tools/list', modern)).result as typeof first;
    expect(first.tools.map((t) => t.name)).toEqual(second.tools.map((t) => t.name));
    const writers = first.tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
    expect(writers).toEqual(['settings_write']);
  });

  it('serves the docs with no window connected', async () => {
    const found = (await rpc('tools/call', { name: 'docs_search', arguments: { query: 'fillet' } }))
      .result as { structuredContent: { results: { id: string }[] } };
    expect(found.structuredContent.results[0]?.id).toBe('fillet');
    const read = (await rpc('tools/call', { name: 'docs_read', arguments: { id: 'extrude' } }))
      .result as { content: { type: string; text?: string }[] };
    expect(read.content[0]?.text).toContain('# Extrude');
    expect(read.content[0]?.text).not.toContain('{{key:');
    const glance = (
      await rpc('tools/call', { name: 'docs_read', arguments: { id: 'editor-at-a-glance' } })
    ).result as { content: { type: string; text?: string }[] };
    expect(glance.content.some((part) => part.type === 'image')).toBe(true);
    expect(glance.content.some((part) => part.text?.includes('arrow 1 points at'))).toBe(true);
  });

  it('tells the assistant the pairing code when no window is there', async () => {
    const status = (await rpc('tools/call', { name: 'app_status', arguments: {} })).result as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(status.isError).toBe(true);
    expect(status.content[0]?.text).toContain(CODE);
  });

  it('refuses a window without the code', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/app/events?code=WRONG`);
    expect(response.status).toBe(401);
    const reply = await fetch(`http://127.0.0.1:${PORT}/app/reply`, { method: 'POST', body: '{}' });
    expect(reply.status).toBe(401);
    const page = await fetch(`http://127.0.0.1:${PORT}/app/events?code=${CODE}`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(page.status).toBe(403);
  });

  it('asks a connected window and hands its answer to the assistant', async () => {
    const leave = await connectWindow((method) =>
      method === 'status' ? { workspace: 'design', keymap: 'fusion360' } : null,
    );
    const status = (await rpc('tools/call', { name: 'app_status', arguments: {} })).result as {
      structuredContent: { workspace: string };
    };
    expect(status.structuredContent.workspace).toBe('design');
    // The keymap the window reported is the one the docs now speak.
    const keys = (await rpc('tools/call', { name: 'keymap', arguments: {} })).result as {
      content: { text: string }[];
    };
    expect(keys.content[0]?.text).toContain('Keymap: fusion360');
    leave();
  });
});
