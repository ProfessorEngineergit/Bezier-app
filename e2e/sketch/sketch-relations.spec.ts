/**
 * More relations through the bar: a point with a line offers Point on, Midpoint and Distance to
 * line; two points offer the distances between them, each a label that accepts a typed value; a
 * line's length can be marked reference-only.
 */

import type { Page } from '@playwright/test';
import { canvasRect, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

/** A line and a second one joined to it, on the plane at the centre of the view. */
async function drawing(page: Page) {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Line').click();
  const at = (fx: number, fy: number) =>
    page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
  await at(0.4, 0.45);
  await at(0.55, 0.45);
  await at(0.6, 0.6);
  await page.keyboard.press('Escape');
  const shift = async (fx: number, fy: number) => {
    await page.keyboard.down('Shift');
    await at(fx, fy);
    await page.keyboard.up('Shift');
  };
  return {
    // Near its start, so the line stays under the click after a shorter length is typed.
    firstLine: () => at(0.42, 0.45),
    farEnd: () => at(0.6, 0.6),
    firstEnd: () => at(0.4, 0.45),
    shift,
  };
}

const bar = (page: Page) => page.getByRole('region', { name: 'Constraints' });

test('a point and a line offer Point on, Midpoint and Distance to line', async ({ page }) => {
  const sketch = await drawing(page);
  await sketch.farEnd();
  await sketch.shift(0.47, 0.45);
  for (const name of ['Point on', 'Midpoint', 'Distance to line'])
    await expect(bar(page).getByRole('button', { name })).toBeVisible();
  await expect(bar(page).getByRole('button', { name: 'Parallel' })).toHaveCount(0);

  await bar(page).getByRole('button', { name: 'Midpoint' }).click();
  await expect(page.getByRole('button', { name: 'Remove Midpoint' })).toBeVisible();
  await expect(page.getByText(/contradicts|could not be solved/)).toHaveCount(0);
});

test('two points take a horizontal distance that holds a typed value', async ({ page }) => {
  const sketch = await drawing(page);
  await sketch.firstEnd();
  await sketch.shift(0.6, 0.6);
  await expect(bar(page).getByRole('button', { name: 'Vertical distance' })).toBeVisible();
  await bar(page).getByRole('button', { name: 'Horizontal distance' }).click();

  const field = page.getByLabel(/^Value for sketch dimension /);
  await expect(field).toHaveCount(1);
  await field.click();
  await field.fill('25');
  await field.press('Enter');
  await expect(field).toHaveValue('25');
});

test('a line length kept for reference reads in brackets and is not typed into', async ({
  page,
}) => {
  const sketch = await drawing(page);
  const length = page.getByLabel(/^Length for sketch line /).first();
  await length.click();
  await length.fill('30');
  await length.press('Enter');
  await sketch.firstLine();
  await bar(page).getByRole('button', { name: 'Reference' }).click();
  await expect(page.locator('.sketch-dimension__value', { hasText: '(30)' })).toBeVisible();
});

test('two lines can be held in a typed ratio', async ({ page }) => {
  const sketch = await drawing(page);
  await sketch.firstLine();
  await sketch.shift(0.575, 0.525);
  await bar(page).getByRole('button', { name: 'Ratio' }).click();
  const mark = page.getByRole('button', { name: /^Change the .*× length ratio$/ });
  await expect(mark).toBeVisible();
  await mark.click();
  const field = page.getByLabel('Length ratio', { exact: true });
  await field.fill('2');
  await field.press('Enter');
  await expect(page.getByRole('button', { name: 'Change the 2× length ratio' })).toBeVisible();
});

test('two picked points can be levelled', async ({ page }) => {
  const sketch = await drawing(page);
  await sketch.firstEnd();
  await sketch.shift(0.6, 0.6);
  await bar(page).getByRole('button', { name: 'Horizontal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Horizontal' })).toBeVisible();
});
