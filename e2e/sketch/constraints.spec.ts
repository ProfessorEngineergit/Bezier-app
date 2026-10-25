/**
 * Constraints: picking lines shows the applicable constraints, one click adds one, and its mark on
 * the drawing removes it again. Works with either solver: the real one moves the drawing; the
 * fallback, used only when the real one cannot load, stores constraints without enforcing them and
 * says so.
 */

import type { Page } from '@playwright/test';
import { canvasRect, openApp, railButton, said } from '../app.js';
import { expect, test } from '../fixtures.js';

/** Two joined lines, drawn on the plane at the centre of the view. */
async function twoLines(page: Page) {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.keyboard.press('l');
  const at = (fx: number, fy: number) =>
    page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
  await at(0.4, 0.45);
  await at(0.55, 0.45);
  await at(0.6, 0.6);
  // One Escape drops the line tool; a second would leave the sketch.
  await page.keyboard.press('Escape');
  return {
    first: () => at(0.47, 0.45),
    second: async () => {
      await page.keyboard.down('Shift');
      await at(0.575, 0.525);
      await page.keyboard.up('Shift');
    },
  };
}

test('picking two lines offers the constraints that fit them', async ({ page }) => {
  const lines = await twoLines(page);
  await lines.first();
  const bar = page.getByRole('region', { name: 'Constraints' });
  await expect(bar.getByRole('button', { name: 'Horizontal' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Parallel' })).toHaveCount(0);
  await lines.second();
  await expect(bar.getByRole('button', { name: 'Parallel' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Perpendicular' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Tangent' })).toHaveCount(0);
});

test('a constraint shows a mark, and the mark takes it back out', async ({ page }) => {
  const lines = await twoLines(page);
  await lines.first();
  await lines.second();
  await page
    .getByRole('region', { name: 'Constraints' })
    .getByRole('button', { name: 'Perpendicular' })
    .click();
  const mark = page.getByRole('button', { name: 'Remove Perpendicular' });
  await expect(mark).toBeVisible();
  await mark.click();
  await expect(mark).toHaveCount(0);
  // The fallback stores the constraint without enforcing it and says so; the real solver enforces
  // it with no notice.
  const note = said(page).getByText('It takes effect once the constraint solver is in.');
  const standIn =
    (await page.evaluate(() => document.documentElement.dataset.solver)) === 'stand-in';
  await expect(note).toHaveCount(standIn ? 1 : 0);
});

test('an angle shows its value and takes a typed one', async ({ page }) => {
  const lines = await twoLines(page);
  await lines.first();
  await lines.second();
  await page
    .getByRole('region', { name: 'Constraints' })
    .getByRole('button', { name: 'Angle' })
    .click();
  const mark = page.getByRole('button', { name: /^Change the .*° angle$/ });
  await expect(mark).toBeVisible();
  await mark.click();
  const field = page.getByLabel('Angle in degrees');
  await field.fill('90');
  await field.press('Enter');
  // The second line turns to the typed angle with or without a solver.
  await expect(page.getByRole('button', { name: 'Change the 90° angle' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove the 90° angle' }).click();
  await expect(page.getByRole('button', { name: /° angle$/ })).toHaveCount(0);
});

test('the corner of two lines can be chamfered or filleted', async ({ page }) => {
  const lines = await twoLines(page);
  const lengths = page.getByRole('textbox', { name: /^Length for sketch line/ });
  await expect(lengths).toHaveCount(2);
  await lines.first();
  await lines.second();
  const bar = page.getByRole('region', { name: 'Constraints' });
  await bar.getByLabel('Corner size').fill('0.5');
  await bar.getByRole('button', { name: 'Chamfer' }).click();
  // A chamfer adds a short third line across the corner.
  await expect(lengths).toHaveCount(3);
  await expect(bar.getByLabel('Corner size')).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(lengths).toHaveCount(2);
  await lines.first();
  await lines.second();
  await bar.getByLabel('Corner size').fill('0.5');
  await bar.getByRole('button', { name: 'Fillet' }).click();
  // A fillet is an arc: the two lines stay two.
  await expect(bar.getByLabel('Corner size')).toHaveCount(0);
  await expect(lengths).toHaveCount(2);
  await expect(page.getByText('does not fit on those lines')).toHaveCount(0);
});
