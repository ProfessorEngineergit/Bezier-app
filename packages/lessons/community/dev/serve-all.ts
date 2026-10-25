/**
 * Runs all development servers behind the store's single address (STORE_PORT, default 8790).
 * Plugins is imported first so it is listening before lessons.
 */

import { server as docs, store as docsStore } from '../docs/dev/serve.js';
import { server as plugins } from '../plugins/dev/serve.js';
import { createFront } from '../server/front.js';
import { createLeaderboardApp } from '../server/leaderboard.js';
import { server as lessons } from './serve.js';

const PORT = Number(process.env.STORE_PORT ?? 8790);
// Fixed counts for the seeded development accounts.
const leaderboard = createLeaderboardApp({
  lessons: () => [{ author: 'Ada', count: 2 }],
  plugins: () => [{ author: 'Bezier', count: 2 }],
  docs: () => docsStore.authors().map(({ author, articles }) => ({ author, count: articles })),
});
createFront({ lessons, plugins, docs, leaderboard }).listen(PORT, '127.0.0.1', () => {
  console.log(`Development community store on http://127.0.0.1:${PORT}`);
});
