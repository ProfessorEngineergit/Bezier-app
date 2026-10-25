/**
 * Docs pictures. Like the tour, not a behaviour test: it puts the app in the state an article
 * describes, captures the relevant part and computes arrow positions from the elements.
 *
 *   pnpm help:pictures
 *
 * Every picture an article references has a state here and vice versa; the last test fails on a
 * missing or orphaned one. Dark theme only and cropped, to keep the images small.
 */

import { ARTICLES } from '../../../apps/studio/src/help/articles/index.js';
import { onAlpha, openApp } from '../../app.js';
import { expect, test } from '../../fixtures.js';
import { photograph, type State } from './frame.js';
import { COLLAB } from './states-collab.js';
import { FILES } from './states-files.js';
import { MODELING } from './states-modeling.js';
import { SETTINGS } from './states-settings.js';
import { SKETCH } from './states-sketch.js';
import { START } from './states-start.js';
import { VIEW } from './states-view.js';
import { WORKSPACES } from './states-workspaces.js';
import { startServer, stopServer } from './sync-server.js';

const STATES: Record<string, State> = {
  ...START,
  ...SKETCH,
  ...MODELING,
  ...VIEW,
  ...FILES,
  ...WORKSPACES,
  ...SETTINGS,
  ...COLLAB,
};

test.describe.configure({ mode: 'parallel' });

// One sync server per worker, for the collaboration pictures.
// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured first argument
test.beforeAll(async ({}, testInfo) => {
  await startServer(testInfo.parallelIndex);
});
test.afterAll(() => stopServer());
test.setTimeout(process.env.CI ? 600_000 : 180_000);

for (const [name, state] of Object.entries(STATES)) {
  test(name, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    // Alpha features are captured on alpha; everything else on stable, as most users see it.
    if (/^(collaboration|community)-/.test(name)) await onAlpha(page);
    await openApp(page);
    await photograph(page, name, await state(page));
  });
}

test('every picture an article names has a state here, and no state is left over', () => {
  const named = ARTICLES.flatMap((article) =>
    Object.keys(article.images).map((key) => `${article.id}-${key}`),
  );
  expect(Object.keys(STATES).sort()).toEqual(named.sort());
});
