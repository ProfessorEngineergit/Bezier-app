/**
 * The Items panel as users see it: a tree of folders, bodies and sketches, without the history
 * list or reference readout (developer settings the fixture enables; turned off here).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addBox, openApp, openItems, pickAt, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

const BOX_STEP = readFileSync(
  fileURLToPath(new URL('../fixtures-files/box-30x20x12.step', import.meta.url)),
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'bezier.preferences';
    const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as {
      values?: Record<string, unknown>;
    } & Record<string, unknown>;
    const values = stored.values ?? stored;
    values.showHistory = false;
    values.showReferences = false;
    window.localStorage.setItem(key, JSON.stringify(stored.values ? stored : values));
  });
});

test('lists bodies and sketches, with no history and no reference readout', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  const tree = page.getByRole('list', { name: 'Items' });
  await expect(tree.locator('.tree-row[data-kind="body"]')).toHaveText(['Body 1']);
  await expect(tree.locator('.tree-row[data-kind="sketch"]')).toHaveCount(1);
  await expect(page.locator('.items-row')).toHaveCount(0);
  await expect(page.locator('.items-panel__filter')).toContainText('All Items');

  await pickAt(page, { x: 20, y: 10, z: 15 });
  await expect(page.locator('.selection')).toHaveCount(0);
});

test('the eye shows on the selected row and under the pointer only', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  const row = page.locator('.tree-row[data-kind="body"]').first();
  const eye = row.locator('.tree-row__eye');
  await page.mouse.move(600, 500);
  await expect.poll(() => eye.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await row.locator('.tree-row__main').click();
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => eye.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await eye.click();
  await expect(row).toHaveAttribute('data-hidden', '');
});

test('an imported STEP file is a folder of its own, named after the file', async ({ page }) => {
  await openApp(page);
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({
    name: 'bracket.step',
    mimeType: 'application/step',
    buffer: BOX_STEP,
  });
  await openItems(page);
  const folder = page.locator('.tree-row[data-kind="folder"]');
  await expect(folder).toHaveText(['bracket']);
  // Collapsed until opened, then the body inside shows.
  await expect(page.locator('.tree-row[data-kind="body"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open bracket' }).click();
  await expect(page.locator('.tree-row[data-kind="body"]')).toHaveText(['Body 1']);
  // The folder's eye hides all its contents in one step.
  await page.getByRole('button', { name: 'Hide folder bracket' }).click();
  await expect(page.locator('.tree-row[data-kind="body"]')).toHaveAttribute('data-hidden', '');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.tree-row[data-kind="body"]')).not.toHaveAttribute('data-hidden', '');
});

test('Shift-click selects the rows between, Cmd or Ctrl-click one row', async ({ page }) => {
  await openApp(page);
  for (const name of ['a', 'b', 'c']) {
    const chooser = page.waitForEvent('filechooser');
    await railButton(page, 'File').click();
    await (await chooser).setFiles({
      name: `${name}.step`,
      mimeType: 'application/step',
      buffer: BOX_STEP,
    });
    await expect(page.locator('html[data-busy]')).toHaveCount(0);
  }
  await openItems(page);
  for (const name of ['a', 'b', 'c'])
    await page.getByRole('button', { name: `Open ${name}` }).click();
  const bodies = page.locator('.tree-row[data-kind="body"]');
  await expect(bodies).toHaveCount(3);

  await bodies.nth(0).locator('.tree-row__main').click();
  await bodies
    .nth(2)
    .locator('.tree-row__main')
    .click({ modifiers: ['Shift'] });

  // From the last row clicked to this one, and everything between.
  for (const index of [0, 1, 2])
    await expect(bodies.nth(index)).toHaveAttribute('aria-current', 'true');

  // Cmd or Ctrl takes one row out again, and puts it back.
  const middle = bodies.nth(1).locator('.tree-row__main');
  await middle.click({ modifiers: ['ControlOrMeta'] });
  await expect(bodies.nth(1)).toHaveAttribute('aria-current', 'false');
  await expect(bodies.nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(bodies.nth(2)).toHaveAttribute('aria-current', 'true');
  await middle.click({ modifiers: ['ControlOrMeta'] });
  await expect(bodies.nth(1)).toHaveAttribute('aria-current', 'true');

  // A plain click starts over, and a Shift-click from there runs the other way.
  await bodies.nth(2).locator('.tree-row__main').click();
  await expect(bodies.nth(0)).toHaveAttribute('aria-current', 'false');
  await bodies
    .nth(0)
    .locator('.tree-row__main')
    .click({ modifiers: ['Shift'] });
  for (const index of [0, 1, 2])
    await expect(bodies.nth(index)).toHaveAttribute('aria-current', 'true');
});

test('a consumed sketch can be selected and moved with its dependent body', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  const sketch = page.locator('.tree-row[data-kind="sketch"]').first();
  await expect(sketch.locator('.tree-row__description')).toContainText('Body 1');
  await sketch.locator('.tree-row__main').click();
  await expect(sketch).toHaveAttribute('aria-current', 'true');
  await railButton(page, 'Transform').click();
  await railButton(page, 'Move/Rotate').click();
  await expect(page.getByRole('toolbar', { name: 'Move and rotate' })).toBeVisible();
  await page.getByRole('button', { name: 'Move Z', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Move distance' }).fill('10');
  await page.getByRole('spinbutton', { name: 'Move distance' }).press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await sketch.locator('.tree-row__main').dblclick();
  await expect(page.getByRole('textbox', { name: 'Offset', exact: true })).toHaveValue('10');
});
