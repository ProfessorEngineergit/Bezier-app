/**
 * Shell uses up the face it was given: the pull on that face must end, and the new step's own
 * settings take its place.
 */

import { addBox, canvasRect, openApp, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

test('after Shell the face offer is gone and Thickness is ready', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const top = screenPointOf(await canvasRect(page), { x: 20, y: 10, z: 15 });
  await page.mouse.click(top.x, top.y);
  await expect(page.getByRole('textbox', { name: 'Extrude distance' })).toBeVisible();

  // Still open from adding the box.
  await railButton(page, 'Shell').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await expect(page.getByRole('textbox', { name: 'Extrude distance' })).toHaveCount(0);
  await expect(page.getByLabel('Thickness')).toHaveValue('2');
});

test('a half outline against the vertical axis revolves about it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Front', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  await page.keyboard.press('l');
  const rect = await canvasRect(page);
  const at = (fx: number, fy: number) =>
    page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
  await at(0.5, 0.3);
  await at(0.62, 0.3);
  await at(0.62, 0.7);
  await at(0.5, 0.7);
  await at(0.5, 0.3);
  await page.keyboard.press('Escape');
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await railButton(page, 'Tools').click();
  await railButton(page, 'Revolve').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await page.getByRole('button', { name: 'More settings' }).click();
  await expect(page.getByLabel('Axis', { exact: true })).toHaveValue('v');
  await expect(page.getByLabel('Angle', { exact: true })).toHaveValue('360');
});

test('one undo takes back one typed value', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const top = screenPointOf(await canvasRect(page), { x: 20, y: 10, z: 15 });
  await page.mouse.click(top.x, top.y);
  await railButton(page, 'Shell').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  const thickness = page.getByLabel('Thickness');
  await expect(thickness).toHaveValue('2');

  await thickness.dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('3', { delay: 70 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(thickness).toHaveValue('3');

  await thickness.blur();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(thickness).toHaveValue('2');
});
