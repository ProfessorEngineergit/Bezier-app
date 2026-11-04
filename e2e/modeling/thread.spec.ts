/** Threads and metric holes through the rail, as someone uses them. */

import type { Page } from '@playwright/test';
import { addBox, canvasRect, openApp, openItems, pickAt, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

const settled = (page: Page) => expect(page.locator('html[data-busy]')).toHaveCount(0);

async function shaft(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.keyboard.press('c');
  const at = (x: number, y: number) =>
    page.mouse.click(rect.x + rect.width * x, rect.y + rect.height * y);
  await at(0.5, 0.5);
  await at(0.6, 0.5);
  await page.getByRole('textbox', { name: /Diameter for sketch circle/ }).fill('12');
  await page.getByRole('textbox', { name: /Diameter for sketch circle/ }).press('Enter');
  await railButton(page, 'Finish Sketch').click();
  await settled(page);
  await at(0.5, 0.5);
  const field = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await field.fill('20');
  await field.press('Enter');
  await settled(page);
}

test('a shaft takes a thread with the pitch of its metric size', async ({ page }) => {
  await shaft(page);
  await openItems(page);
  await page.getByRole('button', { name: 'Front', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(700);
  // Seen from the front, the middle of the shaft stands above the middle of the view.
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.42);
  await railButton(page, 'Tools').click();
  await railButton(page, 'Thread').click();
  await settled(page);
  await expect(page.locator('.items-row').last()).toHaveText('Thread');
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await expect(page.locator('.inspector').getByLabel('Pitch')).toHaveValue('1.75');
});

test('Thread without a round wall says what to click', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Thread').click();
  await expect(page.locator('.nib-island, .toast')).toContainText('round wall');
});

test('a metric size sets the hole, and hides what it decides', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  await railButton(page, 'Hole').click();
  await settled(page);
  const inspector = page.locator('.inspector');
  await expect(inspector.getByLabel('Diameter')).toBeVisible();
  await inspector.getByLabel('Size').selectOption('M4');
  await settled(page);
  await expect(inspector.getByLabel('Diameter')).toHaveCount(0);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});
