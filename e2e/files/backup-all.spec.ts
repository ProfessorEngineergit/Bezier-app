/** Every project in one file, and back: what stands between a person and a lost browser profile. */

import { addBox, expectSaid, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

test('all projects go into one file and come back from it', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Projects' }).click();
  const cards = page.locator('.library [data-doc-id]');
  await expect(cards.first()).toBeVisible();
  const before = await cards.count();

  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  const preferences = page.getByRole('region', { name: 'Preferences' });
  await preferences.getByRole('button', { name: 'Data & Privacy', exact: true }).click();
  const saved = page.waitForEvent('download');
  await preferences.getByRole('button', { name: 'Save backup' }).click();
  const download = await saved;
  expect(download.suggestedFilename()).toMatch(/^Bezier \d{4}-\d{2}-\d{2}\.bezierbackup$/);
  const path = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(path);

  await page.getByRole('navigation', { name: 'Library' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles(path);
  await expectSaid(page, 'Imported');
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect.poll(() => cards.count()).toBeGreaterThan(before);
});
