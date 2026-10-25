/**
 * A failing workspace leaves the rest of the app usable: the message names it, Modeling still has
 * the model, and "Try again" restores the workspace.
 */

import { addBox, openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

async function mode(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
}

test('a workspace that breaks does not take the application with it', async ({
  page,
  consoleErrors,
}) => {
  test.skip(process.env.E2E_BUILT === '1', 'The forced failure exists only in development.');
  await openApp(page);
  await addBox(page);
  await page.evaluate(() => {
    (window as { __bezierBreak?: string }).__bezierBreak = 'Visualize';
  });
  await mode(page, 'Visualize');
  await expect(page.getByRole('alert')).toContainText('Visualize stopped working');
  // The rest still works, with the model unchanged.
  await mode(page, 'Modeling');
  await openItems(page);
  await expect(page.locator('.body-row')).toHaveCount(1);
  // Fix the fault and try again.
  await page.evaluate(() => {
    (window as { __bezierBreak?: string }).__bezierBreak = undefined;
  });
  await mode(page, 'Visualize');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel('PBR presentation viewport')).toBeVisible();
  // The errors above are expected.
  consoleErrors.length = 0;
});
