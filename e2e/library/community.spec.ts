/**
 * Community against a real community store (lessons and plugins behind one address,
 * `packages/lessons/community`): off until enabled, the address entered only in Settings, a lesson
 * downloaded and listed on Learn, a plugin installed on its stated terms, and the switch that
 * removes it all again.
 */

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import type { Page } from '@playwright/test';
import { onAlpha, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

const PORT = 18_960;
const STORE = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;

test.describe.configure({ mode: 'serial' });

// Community is alpha-only.
test.beforeEach(async ({ page }) => onAlpha(page));

test.beforeAll(async () => {
  // The servers are TypeScript bundled by Vite; this runs the seeded development pair.
  execFileSync('pnpm', ['community:build'], { stdio: 'ignore' });
  server = spawn('node', ['dist-server/dev-all.js'], {
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      STORE_PORT: String(PORT),
      LESSONS_PORT: String(PORT + 1),
      PLUGINS_PORT: String(PORT + 2),
    },
    stdio: 'ignore',
  });
  await expect
    .poll(
      () =>
        fetch(`${STORE}/lessons/v1/health`)
          .then((r) => r.status)
          .catch(() => 0),
      { timeout: 30_000 },
    )
    .toBe(200);
});

test.afterAll(() => {
  server.kill();
});

const library = (page: Page) => page.getByRole('navigation', { name: 'Library' });

async function openCommunity(page: Page): Promise<void> {
  await library(page)
    .getByRole('button', { name: /^Community/ })
    .click();
}

async function useStore(page: Page): Promise<void> {
  await openApp(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await openCommunity(page);
  // The page opens on the wiki. Without a store address, Plugins says so and points to Settings.
  await page.getByRole('radio', { name: 'Plugins' }).click();
  await page.getByRole('button', { name: 'Community settings' }).click();
  await page.getByRole('textbox', { name: 'Store address' }).fill(STORE);
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /^Community/ })).toBeChecked();
  await openCommunity(page);
}

/** Opens Learn, which lists community lessons when the switch is on (audit H3). */
async function learnWithCommunity(page: Page): Promise<void> {
  await library(page)
    .getByRole('button', { name: /^Learn/ })
    .click();
  await page.getByRole('checkbox', { name: 'Include community lessons' }).check();
}

test('one address in Settings brings lessons and plugins, and the page names no server', async ({
  page,
}) => {
  await useStore(page);
  await learnWithCommunity(page);
  const lessons = page.getByRole('region', { name: 'Community lessons' });
  await expect(lessons.locator('.cl-tile')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /server/i })).toHaveCount(0);
  // Community has no Lessons tab of its own.
  await openCommunity(page);
  await expect(page.getByRole('radio', { name: 'Lessons' })).toHaveCount(0);

  await page.getByRole('radio', { name: 'Plugins' }).click();
  await expect(page.getByRole('region', { name: 'Available plugins' })).toContainText(
    'Model statistics',
  );
  await expect(page.getByRole('region', { name: 'Installed plugins' })).toHaveCount(0);
});

test('a downloaded lesson opens, and is on the Learn page afterwards', async ({ page }) => {
  await useStore(page);
  await learnWithCommunity(page);
  await page.getByRole('button', { name: 'Download Extrude a box' }).click();
  await page.getByRole('button', { name: 'Open Extrude a box' }).click();
  await expect(page.locator('.lessons-player')).toBeVisible();
  await page.getByRole('button', { name: 'Lessons', exact: true }).click();
  // Now on this device as well: the first grid is the local lessons.
  await expect(
    page.locator('.lessons-home .library__grid').first().locator('.lessons-tile'),
  ).toHaveCount(1);
});

test('a plugin is installed on the terms it states and then listed as installed', async ({
  page,
}) => {
  await useStore(page);
  await page.getByRole('radio', { name: 'Plugins' }).click();
  const card = page.getByRole('article', { name: 'Model statistics' });
  await card.getByRole('button', { name: 'Install' }).click();
  const consent = page.getByRole('dialog');
  await expect(consent).toContainText('Read the model you have open');
  await consent.getByRole('button', { name: 'Install' }).click();

  const installed = page.getByRole('region', { name: 'Installed plugins' });
  await expect(installed).toContainText('Model statistics');
  await expect(installed.getByRole('switch', { name: 'Run Model statistics' })).toBeChecked();
  await expect(card).toContainText('Installed');
});

test('the switch in Settings takes Community off the page again', async ({ page }) => {
  await useStore(page);
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await page
    .getByRole('navigation', { name: 'Preference sections' })
    .getByRole('button', { name: /^Community/ })
    .click();
  await page.getByRole('checkbox', { name: /^Community/ }).uncheck();
  await openCommunity(page);
  await page.getByRole('radio', { name: 'Plugins' }).click();
  await expect(page.getByRole('button', { name: 'Turn on Community' })).toBeVisible();
  await expect(page.locator('.cl-tile')).toHaveCount(0);
});
