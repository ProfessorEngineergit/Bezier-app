/**
 * Construction geometry: a centerline guides without forming an area, switching a line to
 * construction opens its outline, and Project brings a face's edges into a sketch on it.
 */

import type { Page } from '@playwright/test';
import { canvasRect, commitExtrude, openApp, openItems, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

async function squareTop(page: Page) {
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(600);
}

async function at(page: Page, fx: number, fy: number) {
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
}

async function finish(page: Page) {
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

async function extrudeRail(page: Page) {
  const button = railButton(page, 'Extrude');
  if (!(await button.isVisible())) await railButton(page, 'Tools').click();
  await button.click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  // On a sketch the command opens the gizmo; on an empty document it builds the starter box.
  const field = page.getByRole('spinbutton', { name: 'Extrude distance' });
  if (await field.isVisible()) await commitExtrude(page);
}

test('a closed chain of centerlines encloses no area to extrude', async ({ page }) => {
  await openApp(page);
  await squareTop(page);
  await railButton(page, 'Sketch').click();
  await railButton(page, 'Centerline').click();
  for (const [x, y] of [
    [0.4, 0.4],
    [0.6, 0.4],
    [0.6, 0.6],
    [0.4, 0.6],
    [0.4, 0.4],
  ] as const) {
    await at(page, x, y);
  }
  await page.keyboard.press('Escape');
  await finish(page);
  await extrudeRail(page);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1']);
});

test('a side switched to construction opens the rectangle it was part of', async ({ page }) => {
  await openApp(page);
  await squareTop(page);
  await railButton(page, 'Sketch').click();
  await page.keyboard.press('r');
  await at(page, 0.4, 0.4);
  await at(page, 0.6, 0.6);
  await page.keyboard.press('Escape');
  // Pick the top side of the rectangle and make it construction.
  await at(page, 0.5, 0.4);
  await railButton(page, 'Construction').click();
  await finish(page);
  await extrudeRail(page);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1']);
});

test('Project brings the edges of the face into the sketch on it', async ({ page }) => {
  await openApp(page);
  await squareTop(page);
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

  // Select the top face and sketch on it.
  await railButton(page, 'Sketch').click();
  await railButton(page, 'Finish Sketch').click();
  await at(page, 0.5, 0.5);
  await railButton(page, 'Sketch').click();
  await expect(
    page.locator('.rail--left .rail__label', { hasText: 'Finish Sketch' }).locator('.rail__detail'),
  ).toHaveText('On a face');
  await railButton(page, 'Project').click();
  await finish(page);

  await at(page, 0.5, 0.5);
  // On a face the distance is signed, so the field is a text box; outward adds.
  const signed = page.getByRole('textbox', { name: 'Extrude distance' });
  await signed.fill('5');
  await signed.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText([
    'Sketch 1',
    'Extrude',
    'Sketch 2',
    'Extrude',
  ]);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('a sketch can stand off its plane, and its part moves with it', async ({ page }) => {
  await openApp(page);
  await squareTop(page);
  await railButton(page, 'Sketch').click();
  await page.keyboard.press('r');
  await at(page, 0.4, 0.4);
  await at(page, 0.6, 0.6);
  await page.keyboard.press('Escape');
  await finish(page);
  await extrudeRail(page);
  await openItems(page);
  await page.locator('.items-row', { hasText: 'Sketch' }).click();
  const offset = page.locator('.inspector').getByLabel('Offset');
  await expect(offset).toHaveValue('0');
  await offset.fill('20');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await expect(page.locator('.body-row')).toHaveCount(1);
});
