/**
 * The extrude result menu beside the distance: a circle on a block pushed into it cuts, and "Cut
 * through all" makes a through hole. A cut on a face must start into the material.
 */

import type { Page } from '@playwright/test';
import { canvasRect, openApp, openItems, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

async function at(page: Page, fx: number, fy: number) {
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
}

async function finish(page: Page) {
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

/** A block seen from above, with a circle drawn on its top face. */
async function circleOnBlock(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  await page.keyboard.press('r');
  await at(page, 0.35, 0.35);
  await at(page, 0.65, 0.65);
  await page.keyboard.press('Escape');
  await finish(page);
  await at(page, 0.5, 0.5);
  const field = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await field.fill('10');
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  // Pick the top face, then sketch on it.
  await railButton(page, 'Sketch').click();
  await railButton(page, 'Finish Sketch').click();
  await at(page, 0.5, 0.5);
  await railButton(page, 'Sketch').click();
  await expect(
    page.locator('.rail--left .rail__label', { hasText: 'Finish Sketch' }).locator('.rail__detail'),
  ).toHaveText('On a face');
  await page.keyboard.press('c');
  await at(page, 0.5, 0.5);
  await at(page, 0.55, 0.5);
  await page.keyboard.press('Escape');
  await finish(page);
}

test('a circle on a block pushed in cuts into it, by the distance or right through', async ({
  page,
}) => {
  await circleOnBlock(page);
  await at(page, 0.5, 0.5);
  // On a face the sign gives the side: the menu offers join, cut, cut through and new body, and
  // defaults to join.
  const result = page.getByRole('combobox', { name: 'Extrude result' });
  await expect(result).toHaveValue('add');
  await expect(result.locator('option')).toHaveText([
    'Add to body',
    'Cut from body',
    'Cut through all',
    'New body',
  ]);
  await result.selectOption('through');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText([
    'Sketch 1',
    'Extrude',
    'Sketch 2',
    'Extrude',
  ]);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await expect(page.locator('.items-row[data-status="failed"]')).toHaveCount(0);
  // From above, the block's middle is now a hole: a click there finds nothing.
  await page.keyboard.press('Escape');
  await at(page, 0.5, 0.5);
  await expect(page.locator('.selection li')).toHaveCount(0);
});

test('a circle on a block typed as a negative distance cuts into the block', async ({ page }) => {
  await circleOnBlock(page);
  await at(page, 0.5, 0.5);
  const input = page.getByRole('textbox', { name: 'Extrude distance' });
  await input.fill('-4');
  await input.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row[data-status="failed"]')).toHaveCount(0);
  await expect(page.locator('.items-row')).toHaveCount(4);
});

test('a circle sketched on the ground plane under a block cuts right through it', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  await page.keyboard.press('r');
  await at(page, 0.35, 0.35);
  await at(page, 0.65, 0.65);
  await page.keyboard.press('Escape');
  await finish(page);
  await at(page, 0.5, 0.5);
  const field = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await field.fill('10');
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  // Away from the block, so the next sketch goes on the ground plane, not its top.
  await at(page, 0.75, 0.85);
  await railButton(page, 'Sketch').click();
  await expect(
    page.locator('.rail--left .rail__label', { hasText: 'Finish Sketch' }).locator('.rail__detail'),
  ).toHaveText('XY plane');
  await page.keyboard.press('c');
  await at(page, 0.5, 0.5);
  await at(page, 0.55, 0.5);
  await page.keyboard.press('Escape');
  await finish(page);
  await at(page, 0.5, 0.5);
  // Off a part, the menu also offers cut through, reaching the block on either side.
  await page.getByRole('combobox', { name: 'Extrude result' }).selectOption('through');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(4);
  await expect(page.locator('.items-row[data-status="failed"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await at(page, 0.5, 0.5);
  await expect(page.locator('.selection li')).toHaveCount(0);
});
