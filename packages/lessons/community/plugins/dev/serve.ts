/**
 * A plugin server for development and browser tests: a fresh data directory, one author with a
 * known token, and the example plugins pre-approved. Never expose it beyond localhost.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPluginConfig } from '../server/config.js';
import { createPluginApp } from '../server/http.js';
import { reviewUpload } from '../server/review.js';
import { PluginStore } from '../server/store.js';
import { EXAMPLES, examplePackage } from './examples.js';

export const DEV_PLUGIN_TOKEN = 'dev-plugin-token-for-local-testing';
const PORT = Number(process.env.PLUGINS_PORT ?? 8789);

const dir = mkdtempSync(join(tmpdir(), 'plugins-dev-'));
const store = new PluginStore(dir);
const { author } = store.createAuthor('Bezier', 50, DEV_PLUGIN_TOKEN);

for (const name of EXAMPLES) {
  const reviewed = await reviewUpload(await examplePackage(name), []);
  const versionId = await store.insert(
    author,
    reviewed.plugin.manifest,
    reviewed.bytes,
    reviewed.findings,
  );
  await store.setStatus(versionId, 'approved');
}

const config = {
  ...readPluginConfig(),
  name: 'Bezier plugins (development)',
  dataDir: dir,
  port: PORT,
  origins: ['*', 'http://localhost:5180', 'http://localhost:5173'],
};
export const server = createPluginApp(config, store, ['badword']);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Development plugin server on http://127.0.0.1:${PORT} (token ${DEV_PLUGIN_TOKEN})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  });
}
