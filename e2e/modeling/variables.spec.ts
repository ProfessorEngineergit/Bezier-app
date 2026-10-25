/**
 * Variables: name a number, use it in a dimension expression, change the number and the part
 * follows. Undo reverts each step.
 */

import { openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

test('a dimension written as an expression follows its variable', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('e');
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(2);

  await page.keyboard.press('ControlOrMeta+Shift+v');
  const panel = page.getByRole('complementary', { name: 'Variables' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('New variable name').fill('wall');
  await panel.getByLabel('New variable value').fill('4 mm');
  await panel.getByRole('button', { name: 'Add' }).click();
  await expect(panel.getByLabel('Value of wall')).toHaveValue('4 mm');

  await page.locator('.items-row', { hasText: 'Extrude' }).click();
  const field = page.locator('.inspector .property-panel__number').first();
  await field.fill('wall * 3');
  await field.press('Enter');
  await expect(page.locator('.inspector .property-panel__value')).toHaveText('= 12 mm');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  const value = panel.getByLabel('Value of wall');
  await value.fill('5');
  await value.press('Enter');
  await expect(page.locator('.inspector .property-panel__value')).toHaveText('= 15 mm');

  // An undefined name is rejected before it reaches the model.
  await field.fill('nothing * 2');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.press('Enter');
  await expect(page.locator('.inspector .property-panel__value')).toHaveText('= 15 mm');

  // Undo reverts the variable change, then the expression.
  await field.fill('wall * 3');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.inspector .property-panel__value')).toHaveText('= 12 mm');
});

test('a variable used by a dimension can be renamed without breaking it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('e');
  await openItems(page);
  await page.keyboard.press('ControlOrMeta+Shift+v');
  const panel = page.getByRole('complementary', { name: 'Variables' });
  await panel.getByLabel('New variable name').fill('w');
  await panel.getByLabel('New variable value').fill('2 cm');
  await panel.getByRole('button', { name: 'Add' }).click();
  await page.locator('.items-row', { hasText: 'Extrude' }).click();
  const field = page.locator('.inspector .property-panel__number').first();
  await field.fill('w + 1');
  await field.press('Enter');
  await expect(page.locator('.inspector .property-panel__value')).toHaveText('= 21 mm');

  const name = panel.getByLabel('Name of w');
  await name.fill('depth');
  await name.press('Enter');
  await expect(panel.getByLabel('Name of depth')).toBeVisible();
  await expect(field).toHaveValue('depth + 1');
  await expect(page.locator('.inspector .property-panel__value')).toHaveText('= 21 mm');
});
