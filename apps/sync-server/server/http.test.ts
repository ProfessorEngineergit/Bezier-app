import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createSyncServer } from './http.ts';
import { Store } from './store.ts';

let dir = '';
let url = '';
let server: ReturnType<typeof createSyncServer>;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bezier-sync-http-'));
  server = createSyncServer({ store: new Store(join(dir, 'data')), publicRateLimit: 5 });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true });
});

test('nothing but the API is served: no files, whatever the path', async () => {
  for (const path of [
    '/',
    '/server/auth.ts',
    '/protocol/crypto.test.ts',
    '/package.json',
    '/web/../server/auth.ts',
    '/protocol/../../README.md',
  ]) {
    assert.equal((await fetch(`${url}${path}`)).status, 404, path);
  }
});

test('API routes need a session, and say so before reading anything', async () => {
  const res = await fetch(`${url}/v1/vaults`, { method: 'POST', body: 'not json' });
  assert.equal(res.status, 401);
  const users = await fetch(`${url}/v1/users/${'a'.repeat(32)}`);
  assert.equal(users.status, 401);
});

test('health says how many copies are healthy, not where they are', async () => {
  const body = (await (await fetch(`${url}/v1/health`)).json()) as { replicas: object[] };
  assert.deepEqual(body.replicas, [{ ok: true }]);
  assert.ok(!JSON.stringify(body).includes(dir));
});

test('login routes are rate limited per address', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 8; i++) {
    statuses.push((await fetch(`${url}/v1/auth/challenge`, { method: 'POST', body: '{}' })).status);
  }
  assert.ok(statuses.includes(429), statuses.join());
});
