/**
 * Selection, which every gizmo depends on: a click replaces, a held modifier adds and removes, a
 * double-click selects the whole body, and a click on empty space clears.
 */

import {
  addBox,
  canvasRect,
  doubleClickAt,
  openApp,
  pickAt,
  selectionCount,
  shiftPickAt,
} from '../app.js';
import { expect, test } from '../fixtures.js';

const TOP = { x: 20, y: 10, z: 15 };
const SIDE = { x: 40, y: 10, z: 7 };

test('a plain click selects exactly what was clicked', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  await pickAt(page, TOP);
  expect(await selectionCount(page)).toBe(1);

  // A second plain click replaces and does not accumulate.
  await pickAt(page, SIDE);
  expect(await selectionCount(page)).toBe(1);
});

test('a held modifier adds a second face, and removes it again', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  await pickAt(page, TOP);
  await shiftPickAt(page, SIDE);
  expect(await selectionCount(page)).toBe(2);

  // The same face again toggles it off: add and remove are one gesture.
  await shiftPickAt(page, SIDE);
  expect(await selectionCount(page)).toBe(1);
});

test('a double-click takes the whole body and opens Move/Rotate', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  await doubleClickAt(page, TOP);
  // Body transforms show a compact tool panel instead of exposing stable face IDs.
  await expect(page.locator('.selection')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Move and rotate' })).toBeVisible();
  await expect(page.locator('.move-gizmo')).toBeVisible();
});

test('a plain click on empty space clears the selection', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  await pickAt(page, TOP);
  expect(await selectionCount(page)).toBe(1);

  const rect = await canvasRect(page);
  // Empty floor at the lower right: not a corner (rail buttons) and not bottom centre, where the
  // selection readout sits in a smaller window and takes the click.
  await page.mouse.click(rect.x + rect.width * 0.75, rect.y + rect.height * 0.8);
  await page.waitForTimeout(120);
  expect(await selectionCount(page)).toBe(0);
});

test('a held click on empty space leaves the selection alone', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  await pickAt(page, TOP);
  const rect = await canvasRect(page);
  // Missing the model while adding must keep the selection; a near miss mid multi-pick is the worst
  // time to lose it.
  await page.keyboard.down('Shift');
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height - 10);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  expect(await selectionCount(page)).toBe(1);
});
