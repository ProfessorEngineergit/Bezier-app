/** Starts the community server. Configuration: config.ts, community/README.md. */

import { join } from 'node:path';
import { readConfig } from './config.js';
import { createApp } from './http.js';
import { Store } from './store.js';
import { loadBlocklist } from './text-filter.js';

const config = readConfig();
const store = new Store(config.dataDir);
const server = createApp(config, store, loadBlocklist(join(config.dataDir, 'blocklist.txt')));

server.listen(config.port, config.host, () => {
  console.log(`Community lessons listening on http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
