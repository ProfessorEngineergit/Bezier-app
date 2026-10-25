/**
 * Keyboard shortcuts. Keys come from the same command declarations as the rail, so a key and its
 * button cannot drift apart. A key runs its command, except when a text field has focus.
 */

import {
  addBox,
  canvasRect,
  expectSaid,
  openApp,
  openItems,
  pickAt,
  railButton,
  selectionCount,
} from '../app.js';
import { expect, test } from '../fixtures.js';

test('pressing E extrudes, the same as the rail command', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('e');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});

test('R picks up the rectangle tool rather than building anything', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('r');
  await page.waitForTimeout(200);

  // Drawing tools need a plane first; the hint is shown over the canvas for a few seconds.
  await expectSaid(page, 'Choose a plane to sketch on first.');
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(0);
});

test('a shortcut key does nothing while a text field has focus', async ({ page }) => {
  await openApp(page);
  // E builds an extrude, which gives this test a dimension field.
  await page.keyboard.press('e');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(2);

  // Focus the extrude's dimension field and type a value containing a shortcut letter. Nothing
  // must be built.
  await page.locator('.items-row', { hasText: 'Extrude' }).click();
  const field = page.locator('.inspector .property-panel__number').first();
  await field.focus();
  await page.keyboard.type('12e1');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  // Still one sketch and one extrude: the typing fired no tool.
  await expect(page.locator('.items-row')).toHaveCount(2);
});

test('a shortcut with a modifier is not confused for the bare key', async ({ page }) => {
  await openApp(page);
  // Cmd+E is not bound here (E is), so nothing is built.
  await page.keyboard.press('ControlOrMeta+e');
  await page.waitForTimeout(200);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(0);
});

test('Cmd+A selects the full body and Escape deselects it', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  await page.keyboard.press('ControlOrMeta+a');
  // The Move gizmo replaces the reference readout while the whole body is selected.
  await expect(page.locator('.move-gizmo')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.move-gizmo')).toHaveCount(0);
});

test('Cmd+period deselects without changing the document', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  expect(await selectionCount(page)).toBe(1);

  await page.keyboard.press('ControlOrMeta+.');
  expect(await selectionCount(page)).toBe(0);
});

test('Enter finishes the current sketch', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.keyboard.press('c');
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.5);

  await page.keyboard.press('Enter');
  await expect(railButton(page, 'Sketch')).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1']);
});
