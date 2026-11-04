/** A rectangle at an angle, the radius of an arc typed in, and a body copied and pasted. */

import { addBox, canvasRect, openApp, openItems, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

test('a rectangle from three points, at an angle, closes into an area', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  const at = (fx: number, fy: number) =>
    page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
  await at(0.5, 0.5);
  await railButton(page, 'Rectangle').click();
  await railButton(page, '3-point').click();
  await at(0.4, 0.55);
  await at(0.55, 0.4);
  await at(0.65, 0.55);
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await at(0.52, 0.5);
  await expect(page.getByRole('spinbutton', { name: 'Extrude distance' })).toBeVisible();
});

test('Copy and Paste make a second body', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await page.locator('.body-row').first().click();
  await page.keyboard.press('ControlOrMeta+c');
  await expect(page.locator('.body-row')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('.body-row')).toHaveCount(2);
});
