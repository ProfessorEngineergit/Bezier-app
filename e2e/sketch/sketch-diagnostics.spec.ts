/**
 * Sketch diagnostics: remaining degrees of freedom (down to fully defined once a rectangle from the
 * origin has both sizes), the conflicting constraint marked red when one is refused, and redundant
 * constraints marked as such.
 */

import type { Page } from '@playwright/test';
import { canvasRect, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

const bar = (page: Page) => page.getByRole('region', { name: 'Constraints' });

test('a rectangle from the origin with both sizes typed is fully defined', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  const plane = page.getByRole('complementary', { name: 'Sketch plane' });
  await railButton(page, 'Rectangle').click();
  // Squared to Top, the origin is at the canvas centre.
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.click(rect.x + rect.width * 0.62, rect.y + rect.height * 0.38);
  await page.keyboard.press('Escape');
  await expect(plane).toContainText(/2 freedoms left/);
  for (const [index, value] of [
    [0, '30'],
    [1, '20'],
  ] as const) {
    const field = page.getByLabel(/^Length for sketch line /).nth(index);
    await field.click();
    await field.fill(value);
    await field.press('Enter');
  }
  await expect(plane).toContainText('Fully defined');
});

/** Two separate lines, selected together. */
async function twoLines(page: Page) {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const at = (fx: number, fy: number) =>
    page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
  await railButton(page, 'Line').click();
  await at(0.35, 0.4);
  await at(0.48, 0.42);
  await page.keyboard.press('Escape');
  await railButton(page, 'Line').click();
  await at(0.55, 0.6);
  await at(0.68, 0.63);
  await page.keyboard.press('Escape');
  return async () => {
    await at(0.415, 0.41);
    await page.keyboard.down('Shift');
    await at(0.615, 0.615);
    await page.keyboard.up('Shift');
  };
}

test('a refused constraint marks the one it contradicts', async ({ page }) => {
  const pick = await twoLines(page);
  await pick();
  await bar(page).getByRole('button', { name: 'Parallel' }).click();
  // Both stay selected after a constraint is added.
  await bar(page).getByRole('button', { name: 'Perpendicular' }).click();
  await expect(page.locator('.constraint-mark[data-state="conflict"]')).toHaveCount(1);
});

test('a constraint that restates the others is marked as such', async ({ page }) => {
  const pick = await twoLines(page);
  await pick();
  await bar(page).getByRole('button', { name: 'Horizontal' }).click();
  await bar(page).getByRole('button', { name: 'Parallel' }).click();
  await expect(page.locator('.constraint-mark[data-state="redundant"]')).toHaveCount(1);
});
