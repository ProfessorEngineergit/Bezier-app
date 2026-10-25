/** Starts the plugin server. Configuration: config.ts, community/plugins/README.md. */

import { join } from 'node:path';
import { loadBlocklist } from '../../server/text-filter.js';
import { readPluginConfig } from './config.js';
import { createPluginApp } from './http.js';
import { PluginStore } from './store.js';

const config = readPluginConfig();
const store = new PluginStore(config.dataDir);
const server = createPluginApp(config, store, loadBlocklist(join(config.dataDir, 'blocklist.txt')));

server.listen(config.port, config.host, () => {
  console.log(`Community plugins listening on http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
