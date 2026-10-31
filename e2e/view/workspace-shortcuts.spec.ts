/**
 * A sketch shortcut pressed in another workspace lands in Modeling, and the orientation cube keeps
 * its hover colour in both themes.
 */

import { canvasRect, forwardFace, openApp } from '../app.js';
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
  // Squared onto the top, the middle of the cube is the top face, below its label.
  await page.locator('.viewcube__face[data-face="top"]').dispatchEvent('click');
  await expect.poll(() => forwardFace(page)).toBe('Top');
  const box = await page.locator('.viewcube__canvas').boundingBox();
  if (box === null) throw new Error('the cube has no box');
  const near = { x: box.x + box.width / 2, y: box.y + box.height / 2 + 12 };
  const pixel = () =>
    page.evaluate(() => {
      const board = document.querySelector('canvas.viewcube__canvas') as HTMLCanvasElement;
      const scale = board.width / board.clientWidth;
      const at = board
        .getContext('2d')
        ?.getImageData(
          Math.round(board.width / 2),
          Math.round(board.height / 2 + 12 * scale),
          1,
          1,
        );
      return at === undefined ? '' : `rgb(${at.data[0]}, ${at.data[1]}, ${at.data[2]})`;
    });
  await page.mouse.move(near.x, near.y);
  await expect.poll(pixel).toBe('rgb(64, 156, 255)');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.mouse.move(near.x - 80, near.y - 80);
  await page.mouse.move(near.x, near.y);
  await expect.poll(pixel).toBe('rgb(0, 122, 255)');
});
