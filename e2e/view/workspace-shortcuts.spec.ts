/**
 * A sketch shortcut pressed in another workspace lands in Modeling, and the orientation cube keeps
 * its hover colour in both themes.
 */

import { canvasRect, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

async function mode(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
}

test('R enters a live rectangle sketch from another workspace', async ({ page }) => {
  await openApp(page);
  await mode(page, 'Visualize');
  await page.keyboard.press('r');
  await expect(page.locator('.workspace')).toHaveAttribute('data-workspace', 'design');
  const rect = await canvasRect(page);
  // The switch rebuilds the viewport and WebKit needs a moment before the plane-picking click
  // lands. Retry until the sketch reports its plane rather than waiting a fixed time.
  const guard = page
    .locator('.rail--left .rail__label', { hasText: 'Finish Sketch' })
    .locator('.rail__detail');
  await expect(async () => {
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await expect(guard).toHaveText(/^(XY|XZ|YZ) plane$/, { timeout: 1500 });
  }).toPass({ timeout: process.env.CI ? 60_000 : 15_000 });
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await expect(page.locator('.sketch-dimension')).toHaveCount(2);
});

test('orientation cube restores blue hover in dark and light mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await page.locator('.viewcube__face[data-face="top"]').hover();
  await expect
    .poll(() =>
      page
        .locator('.viewcube__face[data-face="top"]')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe('rgb(64, 156, 255)');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('.viewcube__face[data-face="top"]').hover();
  await expect
    .poll(() =>
      page
        .locator('.viewcube__face[data-face="top"]')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe('rgb(0, 122, 255)');
});
