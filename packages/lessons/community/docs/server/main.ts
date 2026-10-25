/** Starts the docs server. Configuration: config.ts. */

import { join } from 'node:path';
import { loadBlocklist } from '../../server/text-filter.js';
import { readDocsConfig } from './config.js';
import { createDocsApp } from './http.js';
import { DocsStore } from './store.js';

const config = readDocsConfig();
const store = new DocsStore(config.dataDir);
const server = createDocsApp(config, store, loadBlocklist(join(config.dataDir, 'blocklist.txt')));

server.listen(config.port, config.host, () => {
  console.log(`Community docs listening on http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
