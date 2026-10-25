import { addBox, expectSaid, openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

test('IndexedDB keeps projects across reloads when OPFS cannot open', async ({ page }) => {
  await page.addInitScript(() => {
    // WebKit on Linux has no `navigator.storage`, so OPFS is unavailable already.
    if (navigator.storage === undefined) return;
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: async () => {
        throw new Error('OPFS unavailable in this profile');
      },
    });
  });

  await openApp(page);
  // Without any file storage (WebKit on Linux) IndexedDB is the only option, so there is no failure
  // and no notice.
  test.skip(
    await page.evaluate(() => navigator.storage === undefined),
    'This browser offers no file storage to fail.',
  );
  await expectSaid(page, 'Saving to IndexedDB');
  await addBox(page);

  await page.reload();
  await expect(page.locator('.library')).toBeVisible();
  await page.locator('.tile__face').first().click();
  await openItems(page);
  await expect(page.locator('.items-panel')).toContainText('Extrude');
});
