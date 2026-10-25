/**
 * The MCP server end to end with a real Bezier window: the server runs as a client would start it
 * (stdio), the window connects with its pairing code, and every app tool is called and checked
 * against the window. Nothing is stubbed, so EventSource, CORS and editor state are all exercised.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { addBox, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

const PORT = 7393;
const CODE = 'E2EE-TEST';

let server: ChildProcess;
let next = 1;
const waiting = new Map<number, (reply: unknown) => void>();

interface Called {
  isError?: boolean;
  content: { type: string; text?: string; data?: string }[];
  structuredContent?: Record<string, unknown>;
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<Called> {
  const id = next++;
  const reply = await new Promise<unknown>((resolve) => {
    waiting.set(id, resolve);
    server.stdin?.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })}\n`,
    );
  });
  return (reply as { result: Called }).result;
}

test.beforeAll(async () => {
  server = spawn(process.execPath, ['apps/mcp-server/server/main.ts'], {
    env: { ...process.env, BEZIER_MCP_PORT: String(PORT), BEZIER_MCP_CODE: CODE },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  createInterface({ input: server.stdout as NodeJS.ReadableStream }).on('line', (line) => {
    const reply = JSON.parse(line) as { id: number };
    waiting.get(reply.id)?.(reply);
  });
  await new Promise<void>((resolve) =>
    server.stderr?.on('data', (data: Buffer) => {
      if (data.toString().includes('pairing code')) resolve();
    }),
  );
});

test.afterAll(() => {
  server.kill();
});

test('an assistant reads the window, looks at the model and changes a setting', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  // In Settings, MCP & Automation: enable it and enter the code.
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await page.getByText('MCP & Automation', { exact: true }).first().click();
  await page.getByLabel('MCP server address').fill(`http://127.0.0.1:${PORT}`);
  await page.getByLabel('Pairing code').fill(CODE);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Connected. An assistant can read')).toBeVisible();
  // The setting persists: the next editor connects on its own.
  await openApp(page);
  await addBox(page);

  const status = await call('app_status');
  expect(status.isError).toBeUndefined();
  expect(status.structuredContent?.workspace).toBe('design');

  const model = (await call('project_read')).structuredContent as {
    steps: { type: string; state: string }[];
    bounds: { size: number[] };
  };
  expect(model.steps.map((step) => step.type)).toContain('extrude');
  expect(model.steps.every((step) => step.state === 'ok')).toBe(true);
  expect(model.bounds.size.map(Math.round)).toEqual([40, 20, 15]);

  const shot = await call('viewport_screenshot', { view: 'top', scale: 0.5 });
  const png = shot.content.find((part) => part.type === 'image');
  expect(png?.data?.length ?? 0).toBeGreaterThan(1000);

  const ui = (await call('ui_map')).structuredContent as {
    elements: { name: string; rect: number[] }[];
  };
  expect(ui.elements.some((element) => element.name === 'Extrude')).toBe(true);

  const changed = await call('settings_write', { changes: { theme: 'dark' } });
  expect(changed.isError).toBeUndefined();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const refused = await call('settings_write', { changes: { updateChannel: 'beta' } });
  expect(refused.isError).toBe(true);

  const performance = (await call('performance_read', { sampleMs: 300 })).structuredContent as {
    frames: { sampled: number };
    model: { triangles: number };
  };
  expect(performance.frames.sampled).toBeGreaterThan(0);
  expect(performance.model.triangles).toBeGreaterThan(0);
});
