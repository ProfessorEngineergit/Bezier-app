/**
 * Plugin development: `bezier-plugin dev` serves a folder, the editor loads the plugin from it, and
 * saving reloads the plugin without reloading the page. The plugin is the SDK's template, so this
 * also checks that a new author's first plugin works.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devServer } from '../../packages/plugin-sdk/src/dev-server.js';
import { scaffold } from '../../packages/plugin-sdk/src/templates.js';
import { addBox, onAlpha, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

const PORT = 5297;
let dir: string;
let server: Server;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'plugin-dev-'));
  for (const [name, text] of Object.entries(scaffold('ada.step-count', 'command'))) {
    writeFileSync(join(dir, name), text);
  }
  server = devServer(dir);
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});

test.afterAll(() => {
  server.closeAllConnections();
  server.close();
});

test('a plugin in development runs in the editor and again on every save', async ({ page }) => {
  // Plugins are alpha-only.
  await onAlpha(page);
  await page.addInitScript((address) => {
    if (window === window.top) window.localStorage.setItem('bezier.plugin-dev', address);
  }, `http://127.0.0.1:${PORT}`);
  await openApp(page);
  await addBox(page);

  await page.getByRole('button', { name: 'Plugin commands' }).click();
  await page.getByRole('menuitem', { name: 'Count the steps' }).click();
  await expect(page.getByText(/\d+ steps, 0 not building\./)).toBeVisible();

  const main = join(dir, 'main.js');
  writeFileSync(
    main,
    readFileSync(main, 'utf8').replace("'Count the steps'", "'Count every step'"),
  );
  await page.getByRole('button', { name: 'Plugin commands' }).click();
  await expect(page.getByRole('menuitem', { name: 'Count every step' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Count the steps' })).toHaveCount(0);
});
