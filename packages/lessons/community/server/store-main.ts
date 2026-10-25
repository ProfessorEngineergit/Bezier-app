/**
 * Starts the community store: lessons, plugins, docs and the leaderboard behind one address
 * (front.ts). Each part reads its own configuration; the store only sets STORE_HOST and
 * STORE_PORT.
 */

import { join } from 'node:path';
import { readDocsConfig } from '../docs/server/config.js';
import { createDocsApp } from '../docs/server/http.js';
import { DocsStore } from '../docs/server/store.js';
import { readPluginConfig } from '../plugins/server/config.js';
import { createPluginApp } from '../plugins/server/http.js';
import { PluginStore } from '../plugins/server/store.js';
import { readConfig } from './config.js';
import { createFront } from './front.js';
import { createApp } from './http.js';
import { createLeaderboardApp } from './leaderboard.js';
import { Store } from './store.js';
import { loadBlocklist } from './text-filter.js';

const lessonsConfig = readConfig();
const pluginsConfig = readPluginConfig();
const docsConfig = readDocsConfig();
const lessons = new Store(lessonsConfig.dataDir);
const docs = new DocsStore(docsConfig.dataDir);
const plugins = new PluginStore(pluginsConfig.dataDir);

const front = createFront({
  lessons: createApp(
    lessonsConfig,
    lessons,
    loadBlocklist(join(lessonsConfig.dataDir, 'blocklist.txt')),
  ),
  plugins: createPluginApp(
    pluginsConfig,
    plugins,
    loadBlocklist(join(pluginsConfig.dataDir, 'blocklist.txt')),
  ),
  docs: createDocsApp(docsConfig, docs, loadBlocklist(join(docsConfig.dataDir, 'blocklist.txt'))),
  leaderboard: createLeaderboardApp(
    {
      lessons: () => lessons.authors(),
      plugins: () => plugins.listedAuthors(),
      docs: () => docs.authors().map(({ author, articles }) => ({ author, count: articles })),
    },
    lessonsConfig.origins.length > 0 ? lessonsConfig.origins : ['*'],
  ),
});

// Loopback by default; only the TLS reverse proxy should reach it.
const host = process.env.STORE_HOST ?? '127.0.0.1';
const port = Number(process.env.STORE_PORT ?? 8790);
front.listen(port, host, () => {
  console.log(`Community store listening on http://${host}:${port} (/lessons and /plugins)`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    front.close(() => {
      lessons.close();
      plugins.close();
      docs.close();
      process.exit(0);
    });
  });
}
