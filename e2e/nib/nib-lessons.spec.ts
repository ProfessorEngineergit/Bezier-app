/**
 * The lessons Nib offers when a workspace is first opened, walked through as a user would: the
 * offer appears, Start the lesson starts it, each step says what to do, and the next step follows
 * once it is done. A step waiting for something that never happens breaks the lesson, so every step
 * is reached here.
 */

import type { Page } from '@playwright/test';
import { addBox, canvasRect, openApp, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

const island = (page: Page) => page.locator('.nib-island');

async function firstTimeIn(page: Page, name: string, said: string): Promise<void> {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
  await expect(island(page)).toContainText(`First time in ${name}`, { timeout: 20_000 });
  await island(page).getByRole('button', { name: 'Start the lesson' }).click();
  await expect(island(page)).toContainText(said);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.nib.offered', JSON.stringify(['design']));
  });
  await openApp(page);
  await addBox(page);
});

test('Visualize: a material, the light, and the picture', async ({ page }) => {
  await firstTimeIn(page, 'Visualize', 'makes pictures of your part');
  await island(page).getByRole('button', { name: 'Go on' }).click();
  await expect(island(page)).toContainText('Give it a material');
  await page.locator('.viz-library .viz-material').first().click();
  await expect(island(page)).toContainText('Environment is the light');
  await page.getByRole('tab', { name: 'Environment' }).click();
  await expect(island(page)).toContainText('Capture saves the picture');
  await page.locator('.viz__primary').click();
  await expect(island(page)).not.toContainText('Capture saves the picture', { timeout: 10_000 });
});

test('Drawings: the sheet, a measure on it, and out', async ({ page }) => {
  await firstTimeIn(page, 'Drawings', 'lays your part out on a sheet');
  await island(page).getByRole('button', { name: 'Go on' }).click();
  await expect(island(page)).toContainText('Add a measure');
  // Both ends of an edge in the front view.
  await page.getByRole('button', { name: 'Dimension', exact: true }).click();
  const corners = await page
    .locator('[data-view="front"] polyline')
    .first()
    .evaluate((line: SVGPolylineElement) => {
      const matrix = line.ownerSVGElement?.getScreenCTM();
      if (!matrix) throw new Error('Missing drawing matrix');
      const p = (line.getAttribute('points') ?? '').split(/\s+/).map(Number);
      const a = new DOMPoint(p[0], p[1]).matrixTransform(matrix);
      const b = new DOMPoint(p[p.length - 2], p[p.length - 1]).matrixTransform(matrix);
      return [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ];
    });
  for (const point of corners) await page.mouse.click(point.x, point.y);
  await expect(page.locator('.dwg-dimension')).toHaveCount(1);
  await expect(island(page)).toContainText('Update from model', { timeout: 10_000 });
  await island(page).getByRole('button', { name: 'Go on' }).click();
  await expect(island(page)).toContainText('Export Sheet');
  await island(page).getByRole('button', { name: 'Got it' }).click();
  await expect(island(page)).not.toContainText('Export Sheet');
});

test('Simulation: held, pushed, solved, read', async ({ page }) => {
  test.setTimeout(180_000);
  await firstTimeIn(page, 'Simulation', 'how your part bends under load');
  await island(page).getByRole('button', { name: 'Go on' }).click();
  await expect(island(page)).toContainText('Where is it held');
  const rect = await canvasRect(page);
  const endFace = screenPointOf(rect, { x: 40, y: 10, z: 7.5 });
  const frontFace = screenPointOf(rect, { x: 12, y: 0, z: 7.5 });
  const panel = page.getByRole('complementary', { name: 'Study', exact: true });
  await railButton(page, 'Fixed').click();
  await page.mouse.click(endFace.x, endFace.y);
  await expect(panel.getByRole('region', { name: 'Fixed' })).toContainText('1 face');
  await expect(island(page)).toContainText('Now push on it');
  await railButton(page, 'Force').click();
  await page.mouse.click(frontFace.x, frontFace.y);
  await panel.getByRole('region', { name: 'Force' }).getByRole('button', { name: 'Done' }).click();
  await expect(island(page)).toContainText('Press Solve');
  await page.locator('.sim-solve').click();
  await expect(island(page)).toContainText('Red is where it works hardest', { timeout: 90_000 });
  await island(page).getByRole('button', { name: 'Got it' }).click();
});
