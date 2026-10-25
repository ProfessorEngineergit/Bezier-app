/**
 * The Items panel docks to the edge and pushes the rail aside rather than floating over it, also
 * after being resized; an empty document says so in words instead of showing a blank list.
 */

import { addBox, openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

test('an empty document says it is empty, in the middle of the panel', async ({ page }) => {
  await openApp(page);
  await openItems(page);

  await expect(page.locator('.items-panel__head')).toHaveText('Items');
  await expect(page.locator('.items-panel__filter')).toContainText('All Items');
  await expect(page.locator('.items-panel__emptyTitle')).toHaveText('Workspace is empty');
  await expect(page.locator('.items-row')).toHaveCount(0);
});

test('opening the panel pushes the rail across, not over it', async ({ page }) => {
  await openApp(page);
  await openItems(page);

  const panel = await page.locator('.items-panel').boundingBox();
  const rail = await page.locator('.rail--left').boundingBox();
  expect(panel).not.toBeNull();
  expect(rail).not.toBeNull();

  // The rail begins to the right of the panel's right edge: docked, not covered.
  expect(rail?.x ?? 0).toBeGreaterThanOrEqual((panel?.x ?? 0) + (panel?.width ?? 0));
});

test('each feature is a row, and clicking one selects it', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);

  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);

  const sketch = page.locator('.items-row', { hasText: 'Sketch' });
  await sketch.click();
  await expect(sketch).toHaveAttribute('aria-current', 'true');
  // Selecting an item opens its parameters.
  await expect(page.locator('.inspector')).toBeVisible();
});

test('the filter narrows to one kind of thing at a time', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);

  const filter = page.locator('.items-panel__filter');
  await filter.click();
  await page.getByRole('menuitemradio', { name: 'Sketches', exact: true }).click();
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1']);

  await filter.click();
  await page.getByRole('menuitemradio', { name: 'Bodies', exact: true }).click();
  await expect(page.locator('.items-row')).toHaveText(['Extrude']);

  await filter.click();
  await page.getByRole('menuitemradio', { name: 'All Items' }).click();
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});

test('a row renames in place, and the rename undoes', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);

  await page.locator('.items-row', { hasText: 'Extrude' }).dblclick();
  const field = page.locator('.items-row--input');
  await expect(field).toBeFocused();
  await field.fill('Base Plate');
  await field.press('Enter');

  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Base Plate']);

  // A name is document state, so undo must cover it like geometry.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});

test('the panel can be dragged wider, and the rail keeps out of its way', async ({ page }) => {
  await openApp(page);
  await openItems(page);
  // Measure once it has slid in; during its 140 ms entry animation the strip is still moving.
  await page
    .locator('.items-panel')
    .evaluate((panel) => Promise.all(panel.getAnimations().map((motion) => motion.finished)));

  const before = await page.locator('.items-panel').boundingBox();
  const handle = await page.locator('.items-panel__resize').boundingBox();
  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();

  await page.mouse.move((handle?.x ?? 0) + 4, (handle?.y ?? 0) + 120);
  await page.mouse.down();
  await page.mouse.move((handle?.x ?? 0) + 4 + 90, (handle?.y ?? 0) + 120, { steps: 8 });
  await page.mouse.up();

  const after = await page.locator('.items-panel').boundingBox();
  expect(after?.width ?? 0).toBeGreaterThan(before?.width ?? 0);

  // After resizing, the rail still starts past the panel's edge.
  const rail = await page.locator('.rail--left').boundingBox();
  expect(rail?.x ?? 0).toBeGreaterThanOrEqual((after?.x ?? 0) + (after?.width ?? 0));
});
