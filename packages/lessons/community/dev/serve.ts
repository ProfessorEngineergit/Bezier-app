/**
 * A community server for development and browser tests: a fresh data directory, one account with
 * a known token, and the sample lesson pre-approved. Never expose it beyond localhost.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../server/config.js';
import { createApp } from '../server/http.js';
import { inspectUpload } from '../server/inspect.js';
import { Store } from '../server/store.js';

export const DEV_TOKEN = 'dev-token-for-local-testing-only';
const PORT = Number(process.env.LESSONS_PORT ?? 8788);

const dir = mkdtempSync(join(tmpdir(), 'lessons-dev-'));
const store = new Store(dir);
const { account } = store.createAccount('Ada', 50, DEV_TOKEN);

// The sample under two titles, so search and filters have something to work with.
const sample = new Uint8Array(readFileSync('packages/lessons/samples/box-extrude.bezierlesson'));
const seeds = [
  {
    title: 'Extrude a box',
    description: 'Sketch a rectangle and pull it into a solid.',
    level: 'beginner',
  },
  {
    title: 'Box with exact dimensions',
    description: 'The same box, driven by typed sizes.',
    level: 'intermediate',
  },
] as const;
for (const [index, seed] of seeds.entries()) {
  const id = String(index + 1).padStart(32, '0');
  const accepted = await inspectUpload(sample, id, []);
  const manifest = { ...accepted.manifest, ...seed };
  await store.insert(account, manifest, accepted.bytes, `${accepted.contentHash}-${index}`);
  await store.setStatus(id, 'approved');
}

const config = {
  ...readConfig(),
  name: 'Bezier lessons (development)',
  dataDir: dir,
  port: PORT,
  origins: ['*', 'http://localhost:5180', 'http://localhost:5173'],
};
export const server = createApp(config, store, ['badword']);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Development community server on http://127.0.0.1:${PORT} (token ${DEV_TOKEN})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  });
}
