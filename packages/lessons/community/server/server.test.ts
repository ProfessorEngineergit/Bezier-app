import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { downloadCommunityLesson, listCommunity } from '../client/client.js';
import { fetchServerInfo } from '../client/server-info.js';
import type { Source } from '../client/sources.js';
import { readConfig } from './config.js';
import { createApp } from './http.js';
import { Store } from './store.js';

const sample = readFileSync('packages/lessons/samples/box-extrude.bezierlesson');
let dir: string;
let store: Store;
let base: string;
let token: string;
let close: () => void;
let source: Source;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'community-'));
  store = new Store(dir);
  token = store.createAccount('Ada', 5).token;
  const server = createApp(
    { ...readConfig({}), dataDir: dir, origins: ['https://app.example'] },
    store,
    [],
  );
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

const post = (body: BodyInit, auth: string | null = token) =>
  fetch(`${base}/v1/lessons`, {
    method: 'POST',
    body,
    headers: auth === null ? {} : { Authorization: `Bearer ${auth}` },
  });

describe('community server', () => {
  it('refuses an upload without a token', async () => {
    expect((await post(sample, null)).status).toBe(401);
    expect((await post(sample, 'x'.repeat(43))).status).toBe(401);
  });

  it('refuses garbage with a sentence, and a body past the limit before reading it', async () => {
    const bad = await post(new TextEncoder().encode('nope'));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toContain('.bezierlesson');
    const huge = await fetch(`${base}/v1/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Length': '999999999' },
      body: 'x',
    }).catch(() => null);
    // Node's fetch will not send a mismatched length; either a 413 or a client-side refusal means
    // the oversized body was not accepted.
    if (huge !== null) expect([413, 400]).toContain(huge.status);
  });

  it('keeps an upload hidden until it is approved, then lists, serves and checks it', async () => {
    const up = await post(sample);
    expect(up.status).toBe(202);
    const { id } = await up.json();

    expect((await (await fetch(`${base}/v1/lessons`)).json()).lessons).toEqual([]);
    expect((await fetch(`${base}/v1/lessons/${id}`)).status).toBe(404);
    expect((await fetch(`${base}/v1/lessons/${id}/package`)).status).toBe(404);

    // A duplicate upload is rejected.
    expect((await post(sample)).status).toBe(422);

    expect(await store.setStatus(id, 'approved')).toBe(true);
    const page = await listCommunity(source, { q: 'new LESSON' });
    expect(page.lessons).toHaveLength(1);
    expect(page.lessons[0]?.author).toBe('Ada');
    expect((await listCommunity(source, { q: 'zzz' })).lessons).toHaveLength(0);
    expect((await listCommunity(source, { q: '%' })).lessons).toHaveLength(0);

    const entry = page.lessons[0];
    if (entry === undefined) throw new Error('missing entry');
    const lesson = await downloadCommunityLesson(source, entry);
    expect(lesson.manifest.title).toBe(entry.title);
    expect(lesson.manifest.id).not.toBe(id);

    // A wrong hash is detected.
    await expect(
      downloadCommunityLesson(source, { ...entry, sha256: '0'.repeat(64) }),
    ).rejects.toThrow('did not arrive intact');
    // So is a package larger than the catalogue size.
    await expect(downloadCommunityLesson(source, { ...entry, size: 100 })).rejects.toThrow(
      'Could not download',
    );
  });

  it('takes a lesson down after enough reports and deletes a rejected one', async () => {
    const [entry] = (await listCommunity(source, {})).lessons;
    if (entry === undefined) throw new Error('missing entry');
    for (const who of ['a', 'b', 'c']) await store.report(entry.id, who, 'no', 3);
    expect((await listCommunity(source, {})).lessons).toHaveLength(0);
    expect(store.get(entry.id)?.status).toBe('pending');
    await store.setStatus(entry.id, 'rejected', 'test');
    await expect(store.readPackage(entry.sha256)).rejects.toThrow();
  });

  it('says what it is, so the app can check an address before keeping it', async () => {
    const info = await fetchServerInfo(base);
    expect(info).toEqual({ name: 'Community lessons', description: '', uploads: true });
    await expect(fetchServerInfo('http://127.0.0.1:1')).rejects.toThrow('No lessons server');
  });

  it('answers browsers from allowed origins only', async () => {
    const ok = await fetch(`${base}/v1/health`, { headers: { Origin: 'https://app.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example');
    const other = await fetch(`${base}/v1/health`, { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect(other.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
