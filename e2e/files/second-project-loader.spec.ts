/**
 * The loading screen when a second project is opened in the same window. Opening counts loads in
 * and out (`boot-loader.ts`), and the second open takes different paths (first project kept or
 * released, editor already mounted, overlay already run). Every path must end with the screen gone,
 * the bar no longer marked as loading, and the model shown.
 */

import { addBox, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

/** Records every state the loading screen passes through. */
async function watchLoader(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const boot = document.getElementById('boot');
    const log: string[] = [];
    (window as unknown as { __loaderLog: string[] }).__loaderLog = log;
    if (boot === null) return;
    const t0 = performance.now();
    const note = () =>
      log.push(
        `${Math.round(performance.now() - t0)}ms ${boot.hidden ? 'hidden' : 'shown'}|${boot.dataset.state ?? ''}|${boot.hasAttribute('data-below-bar') ? 'below' : ''}|${document.querySelector('.library') ? 'library' : ''}${document.querySelector('canvas.viewport') ? 'editor' : ''}`,
      );
    note();
    new MutationObserver(note).observe(boot, { attributes: true });
  });
}

const loaderLog = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __loaderLog: string[] }).__loaderLog);

async function home(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
}

async function expectLoaderGone(page: import('@playwright/test').Page) {
  await expect(page.locator('#boot')).toBeHidden();
  await expect(page.locator('html[data-loading-below-bar]')).toHaveCount(0);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

test('opening a second project ends with the loading screen gone, kept or read again', async ({
  page,
  browserName,
}) => {
  await openApp(page);
  await addBox(page);
  await home(page);
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await addBox(page);
  await expectLoaderGone(page);
  await home(page);

  // Both projects are still in memory: the second open takes the fast path.
  const tiles = page.locator('.tile__face');
  await expect(tiles).toHaveCount(2);
  await watchLoader(page);
  await tiles.nth(1).click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expectLoaderGone(page);
  await expect(page.locator('canvas.viewport[data-triangles]')).not.toHaveAttribute(
    'data-triangles',
    '0',
  );
  console.log(`[loader, kept] ${(await loaderLog(page)).join(' → ')}`);
  await home(page);
  await expectLoaderGone(page);

  // Read from storage: after a reload nothing is in memory, so both opens read from disk.
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit has no OPFS here: nothing survives a reload',
  );
  await page.reload();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expect(tiles).toHaveCount(2);
  await tiles.nth(0).click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expectLoaderGone(page);
  await home(page);
  await watchLoader(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await tiles.nth(1).click();
  await expect(page.locator('#boot')).toBeVisible();
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expectLoaderGone(page);
  await expect(page.locator('canvas.viewport[data-triangles]')).not.toHaveAttribute(
    'data-triangles',
    '0',
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`[loader, read] ${(await loaderLog(page)).join(' → ')}`);
  await home(page);
  await expectLoaderGone(page);
});

test('a second project opens cleanly after the first was given up while loading', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit has no OPFS here: nothing survives a reload',
  );
  await openApp(page);
  await addBox(page);
  await home(page);
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await addBox(page);
  await home(page);
  await page.reload();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  const tiles = page.locator('.tile__face');
  await expect(tiles).toHaveCount(2);

  // Throttle the CPU so the first open is still in progress when Home is pressed on the loader.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await watchLoader(page);
  await tiles.nth(0).click();
  await expect(page.locator('#boot')).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expectLoaderGone(page);

  await tiles.nth(1).click();
  await expect(page.locator('#boot')).toBeVisible();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expectLoaderGone(page);
  await expect(page.locator('canvas.viewport[data-triangles]')).not.toHaveAttribute(
    'data-triangles',
    '0',
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`[loader, given up then second] ${(await loaderLog(page)).join(' → ')}`);
  // No load is left counted: the next open with nothing to wait for does not bring the screen back.
  await home(page);
  await tiles.nth(1).click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expectLoaderGone(page);
});
