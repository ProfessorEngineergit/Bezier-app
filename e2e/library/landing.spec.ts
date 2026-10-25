/**
 * The landing page and the start-page tip: the logo, the name and the first breadcrumb step lead to
 * the landing page; the wiki tip, once closed, stays closed.
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.js';

const library = (page: Page) => page.getByRole('navigation', { name: 'Library' });
const landing = (page: Page) => page.getByRole('region', { name: 'Bezier', exact: true });

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
}

test('the app opens on the landing page, and coming back from a project it is the projects', async ({
  page,
}) => {
  // The fixture starts tests on the projects; this one checks the default a user gets.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const key = 'bezier.preferences';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const values = (stored.values as Record<string, unknown> | undefined) ?? stored;
    values.startPage = 'home';
    localStorage.setItem(key, JSON.stringify(stored.values ? stored : values));
  });
  await start(page);
  await expect(landing(page)).toBeVisible();

  await landing(page).getByRole('button', { name: 'New Project' }).click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expect(landing(page)).toHaveCount(0);
});

test('the logo, the name and the first step of the breadcrumb lead to the landing page', async ({
  page,
}) => {
  await start(page);
  await expect(landing(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(landing(page)).toBeVisible();
  await expect(landing(page).getByRole('heading', { level: 1 })).toContainText("CAD you'll");

  await library(page).getByRole('button', { name: 'Learn', exact: true }).click();
  await expect(landing(page)).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Location' })
    .getByRole('button', { name: 'Bezier' })
    .click();
  await expect(landing(page)).toBeVisible();
});

test('the landing page counts what the app has, and says plainly that downloads are not counted yet', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  const numbers = page.getByRole('region', { name: 'In numbers' });
  await expect(numbers).toContainText('workspaces on one model');
  await expect(numbers).toContainText('wiki articles');
  await expect(numbers).toContainText('downloads, counted from the launch');
  await expect(
    page.getByRole('region', { name: "What's new" }).getByRole('button'),
  ).not.toHaveCount(0);
});

test('a card on the landing page goes where it says', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: /^New The wiki/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Search the wiki' })).toBeVisible();
});

test('the tip about the wiki is closed once and does not come back', async ({ page }) => {
  // The fixture dismisses the tip for other tests; reopen it before the page starts.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    if (!sessionStorage.getItem('tip-test-started')) {
      sessionStorage.setItem('tip-test-started', 'yes');
      localStorage.removeItem('bezier.tip.wiki');
    }
  });
  await start(page);
  const tip = page.getByRole('complementary', { name: 'Tip' });
  await expect(tip).toContainText('anywhere in Bezier to open the wiki');
  await tip.getByRole('button', { name: /^Close this tip/ }).click();
  await expect(tip).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expect(tip).toHaveCount(0);
});
