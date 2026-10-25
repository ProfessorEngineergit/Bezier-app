/** Inspection state must belong to the visible project and survive ordinary navigation. */
import { addBox, canvasRect, openApp, pickAt, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

test('editor names reach the library, and opening a different project frames its model', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.locator('.titlebar__name').click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Inspection bracket');
  await page.getByRole('textbox', { name: 'Project name' }).press('Enter');
  await expect(page.locator('.titlebar__name')).toHaveText('Inspection bracket');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Inspection bracket' })).toBeVisible();

  await page.getByRole('button', { name: 'New Project' }).click();
  // An empty project's camera must not be inherited by the solid opened next.
  await page.mouse.move(600, 350);
  await page.mouse.wheel(0, 800);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Inspection bracket' }).click();
  await expect(page.locator('.library')).toHaveCount(0);
  // The editor appears at once under a loader, so Home stays reachable while a large model opens.
  // Wait for the model to be drawn first: the editor can appear before it is marked busy, and a
  // click then would hit an empty view.
  await expect(
    page.locator('canvas.viewport[data-triangles]:not([data-triangles="0"])'),
  ).toHaveCount(1);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  expect(await pickAt(page, { x: 20, y: 10, z: 15 })).toMatch(/^F:/);

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.reload();
  // After a reload the app opens on the projects, not the last project, so the name is what must
  // survive.
  await expect(page.locator('.library')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Inspection bracket' })).toBeVisible();
});

test('pinned readings leave the view on a geometry edit and modelling tools exit Measure', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Measure').click();
  const rect = await canvasRect(page);
  for (const point of [
    { x: 10, y: 5, z: 15 },
    { x: 20, y: 10, z: 15 },
  ]) {
    const at = screenPointOf(rect, point);
    await page.mouse.click(at.x, at.y);
  }
  await page.getByRole('button', { name: 'Pin measurement' }).click();
  await railButton(page, 'Tools').click();
  await expect(page.getByRole('complementary', { name: 'Measurements' })).toHaveCount(0);
  await expect(page.locator('.measure-overlay')).toHaveCount(1);
  // A geometry edit unpins measurements, since their points are not stable references (they stay
  // listed, marked possibly stale). Undo removes the box's extrude; an extrude here would change
  // nothing, and an unchanged model keeps its readings.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.measure-overlay')).toHaveCount(0);
});

test('Home while a project is still opening goes back to the projects', async ({ page }) => {
  await openApp(page);
  // The hold below is on an OPFS file read. Without OPFS (WebKit on Linux) the project opens from
  // IndexedDB and there is nothing to hold.
  test.skip(
    await page.evaluate(() => typeof FileSystemFileHandle === 'undefined'),
    'This browser has no OPFS; projects open from IndexedDB.',
  );
  await addBox(page);
  // Reload first: the project just left is reused from memory without being read
  // (use-dashboard.ts), so there would be no open to abandon.
  await page.reload();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  // Stall the journal read so the project is still opening when Home is pressed, as a large model
  // is for most of a minute.
  await page.evaluate(() => {
    const original = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async function (this: FileSystemFileHandle) {
      if (this.name === 'journal.ndjson') await new Promise((resolve) => setTimeout(resolve, 3000));
      return original.call(this);
    };
  });
  await page.locator('.tile__face').first().click();
  await expect(page.locator('#boot')).toHaveAttribute('data-below-bar', '');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library')).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  // The abandoned open must not take over the page when it completes.
  await page.waitForTimeout(3500);
  await expect(page.locator('.library')).toBeVisible();
});
