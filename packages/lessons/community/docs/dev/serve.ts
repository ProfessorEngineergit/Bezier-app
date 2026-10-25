/**
 * A docs server for development and browser tests: a fresh data directory, an author and a
 * reviewer with known tokens, and two published articles. Never expose it beyond localhost.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDocsConfig } from '../server/config.js';
import { createDocsApp } from '../server/http.js';
import { DocsStore } from '../server/store.js';

export const DEV_DOCS_AUTHOR = 'dev-docs-author-token-local';
export const DEV_DOCS_REVIEWER = 'dev-docs-reviewer-token-local';
const PORT = Number(process.env.DOCS_PORT ?? 8791);

const dir = mkdtempSync(join(tmpdir(), 'docs-dev-'));
export const store = new DocsStore(dir);
store.createAccount('Ada', 'author', 10, DEV_DOCS_AUTHOR);
const { account: reviewer } = store.createAccount('Rae', 'reviewer', 10, DEV_DOCS_REVIEWER);

await store.submit(
  reviewer,
  {
    id: 'sketch-on-a-curved-face',
    title: 'Sketch on a curved face',
    area: 'Sketch',
    summary: 'Draw on the side of a cylinder by drawing on a plane and wrapping the result.',
    keywords: 'cylinder curved wrap sketch face',
    body: '## Steps\n\n1. Draw the shape on a flat plane beside the cylinder.\n2. Extrude it past the cylinder.\n3. Subtract it from the cylinder.\n\n> This leaves a cut that follows the curve.',
  },
  {},
);
await store.submit(
  reviewer,
  {
    id: 'naming-your-parts',
    title: 'Naming your parts',
    area: 'Edit',
    summary: 'Give bodies names that say what they are, so the Items list stays readable.',
    keywords: 'rename name items bodies organise',
    body: '1. Open Items.\n2. Double-click a body.\n3. Type the name and press Enter.',
  },
  {},
);

const config = {
  ...readDocsConfig(),
  name: 'Bezier docs (development)',
  dataDir: dir,
  port: PORT,
  origins: ['*', 'http://localhost:5180', 'http://localhost:5173'],
};
export const server = createDocsApp(config, store, ['badword']);
server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `Development docs server on http://127.0.0.1:${PORT} (author ${DEV_DOCS_AUTHOR}, reviewer ${DEV_DOCS_REVIEWER})`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  });
}
