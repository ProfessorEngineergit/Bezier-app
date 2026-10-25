/**
 * The wiki without a store: its list on the Community page, ⌘K from anywhere, an article collapsed
 * into a floating window over an open project, and the Markdown view kept in sync with the editor.
 */

import type { Page } from '@playwright/test';
import { onAlpha } from '../app.js';
import { expect, test } from '../fixtures.js';

const library = (page: Page) => page.getByRole('navigation', { name: 'Library' });

async function openWiki(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await library(page)
    .getByRole('button', { name: /^Community/ })
    .click();
  await expect(page.getByRole('region', { name: 'Getting around' })).toBeVisible();
}

// Wiki editing and the Community page are alpha-only.
test.beforeEach(async ({ page }) => onAlpha(page));

const search = (page: Page) => page.getByRole('dialog', { name: 'Search the wiki' });
const floating = (page: Page) => page.getByRole('region', { name: 'Wiki', exact: true });

test('the list finds an article as it is typed, and opens it at its top', async ({ page }) => {
  await openWiki(page);
  await page.getByRole('searchbox', { name: 'Search the wiki' }).fill('fillet chamfer');
  await page.getByRole('button', { name: /^Fillet and chamfer/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fillet and chamfer' })).toBeVisible();
});

test('⌘K opens the search over whatever is on screen, and Enter opens the article', async ({
  page,
}) => {
  await openWiki(page);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(search(page)).toBeVisible();
  await page.keyboard.type('extrude');
  await page.keyboard.press('Enter');
  await expect(search(page)).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Extrude' })).toBeVisible();
  // Pressing it again closes it.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(search(page)).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(search(page)).toBeHidden();
});

test('a collapsed article floats over a project, and ⌘K opens the next one in a window beside it', async ({
  page,
}) => {
  await openWiki(page);
  await page
    .getByRole('button', { name: /^Extrude/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Collapse' }).click();
  await expect(floating(page).getByRole('heading', { level: 1, name: 'Extrude' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bring it back here' })).toBeVisible();

  await library(page).getByRole('button', { name: 'All Projects' }).click();
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expect(floating(page).getByRole('heading', { level: 1, name: 'Extrude' })).toBeVisible();
  // Inside a project there is no page to expand it back to.
  await expect(floating(page).getByRole('button', { name: 'Expand' })).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('revolve');
  await page.keyboard.press('Enter');
  // A second window opens, and the first keeps its article (audit D10).
  await expect(floating(page)).toHaveCount(2);
  await expect(
    floating(page).nth(0).getByRole('heading', { level: 1, name: 'Extrude' }),
  ).toBeVisible();
  await expect(
    floating(page).nth(1).getByRole('heading', { level: 1, name: 'Revolve' }),
  ).toBeVisible();

  // Any corner resizes it; the top-left one grows it up and to the left.
  const second = floating(page).nth(1);
  const before = await second.boundingBox();
  const corner = await second.locator('.wiki-window__size[data-corner="nw"]').boundingBox();
  if (before === null || corner === null) throw new Error('no window');
  await page.mouse.move(corner.x + 4, corner.y + 4);
  await page.mouse.down();
  await page.mouse.move(corner.x - 40, corner.y - 30, { steps: 5 });
  await page.mouse.up();
  const after = await second.boundingBox();
  expect((after?.width ?? 0) - before.width).toBeGreaterThan(20);

  // Neither window covers the app's controls: the rails stay free.
  const rails = await page
    .locator('.rail .rail__icons')
    .evaluateAll((bands) => bands.map((band) => band.getBoundingClientRect().toJSON() as DOMRect));
  for (const window of [await floating(page).nth(0).boundingBox(), await second.boundingBox()]) {
    if (window === null) continue;
    for (const r of rails) {
      const overlap =
        window.x < r.x + r.width &&
        window.x + window.width > r.x &&
        window.y < r.y + r.height &&
        window.y + window.height > r.y;
      expect(overlap).toBe(false);
    }
  }

  await second.getByRole('button', { name: 'Close the wiki' }).click();
  await expect(floating(page)).toHaveCount(1);
  await floating(page).getByRole('button', { name: 'Close the wiki' }).click();
  await expect(floating(page)).toHaveCount(0);
});

test('the Markdown beside the editor is the same article as the page', async ({ page }) => {
  await openWiki(page);
  await page.getByRole('button', { name: 'New article' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Mirror a body');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  // Typed in the editor, using the input rules for a heading and a list.
  await page.keyboard.type('## Steps');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. Pick the body');
  await expect(page.locator('.ProseMirror h2')).toHaveText('Steps');
  await expect(page.locator('.ProseMirror ol li')).toHaveText('Pick the body');

  await page.getByRole('switch', { name: 'Show Markdown' }).check();
  const markdown = page.getByRole('textbox', { name: 'The article, in Markdown' });
  await expect(markdown).toHaveValue('## Steps\n\n1. Pick the body');

  // And the other way round.
  await markdown.fill('## Steps\n\n1. Pick the body\n2. Press **Mirror**');
  await expect(page.locator('.ProseMirror ol li')).toHaveCount(2);
  await expect(page.locator('.ProseMirror ol li strong')).toHaveText('Mirror');

  await page.getByRole('switch', { name: 'Show Markdown' }).uncheck();
  await expect(markdown).toHaveCount(0);
});
