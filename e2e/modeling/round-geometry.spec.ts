/** Importing exact circular topology must expose one complete, editable rim. */
import { fileURLToPath } from 'node:url';
import { afterFrames, canvasRect, openApp, openItems, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

const CYLINDER = fileURLToPath(new URL('../fixtures-files/cylinder-r10-h10.step', import.meta.url));
const BOUNDS = { min: { x: -10, y: -10, z: 0 }, max: { x: 10, y: 10, z: 10 } };

test('a silhouette point of a circular rim selects and rounds the whole imported edge', async ({
  page,
}) => {
  await openApp(page);
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles(CYLINDER);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  const canvas = page.locator('canvas.viewport');
  await expect(canvas).toHaveAttribute('data-triangles', /^[1-9]/);
  await afterFrames(page);
  const point = screenPointOf(await canvasRect(page), { x: -6, y: 8, z: 10 }, BOUNDS);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.edge-gizmo__bar')).toBeVisible();
  await expect(page.locator('.selection code')).toHaveText(/^E\(/);
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('1');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row', { hasText: 'Fillet' })).toBeVisible();
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('round-rim.png') });
});
