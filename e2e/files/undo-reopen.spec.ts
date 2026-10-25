/** Undo after closing and reopening a project: undo steps are saved with the document (OPFS). */

import { addBox, openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

test('Undo still works after reloading the project', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(2);

  // openApp reloads the page and opens the most recent project again.
  await openApp(page);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(2);
  // The box is two steps: the sketch, then its extrude.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.items-row')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.items-row')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('.items-row')).toHaveCount(1);
});
