/**
 * Curves beyond lines, arcs and circles, extruded to solids: an ellipse (Circle's variant), a
 * closed spline, and text in the app's font. Each must appear in Items without a problem.
 */

import type { Page } from '@playwright/test';
import { canvasRect, commitExtrude, openApp, openItems, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

async function fromTop(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  // Wait for the view to finish turning, or the click lands elsewhere.
  await page.waitForTimeout(700);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  return (fx: number, fy: number) =>
    page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
}

async function extrudeAll(page: Page) {
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('e');
  await commitExtrude(page, '5');
  await openItems(page);
  await expect(page.locator('.items-row', { hasText: 'Extrude' })).toBeVisible();
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
}

test('an ellipse extrudes into an elliptical part', async ({ page }) => {
  const at = await fromTop(page);
  await railButton(page, 'Circle').click();
  await railButton(page, 'Ellipse').click();
  await at(0.5, 0.5);
  await at(0.62, 0.5);
  await at(0.5, 0.56);
  await extrudeAll(page);
});

test('a spline closed on its first point extrudes', async ({ page }) => {
  const at = await fromTop(page);
  await railButton(page, 'Spline').click();
  await at(0.42, 0.5);
  await at(0.5, 0.38);
  await at(0.6, 0.48);
  await at(0.52, 0.62);
  await at(0.42, 0.5);
  await extrudeAll(page);
});

test('text set in the bar extrudes into letters', async ({ page }) => {
  await fromTop(page);
  await railButton(page, 'Text').click();
  const bar = page.getByRole('region', { name: 'Text' });
  await bar.getByLabel('Text', { exact: true }).fill('Hi');
  await bar.getByLabel('Height', { exact: true }).fill('20');
  await bar.getByRole('button', { name: 'Done' }).click();
  await expect(bar).toHaveCount(0);
  await extrudeAll(page);
});
