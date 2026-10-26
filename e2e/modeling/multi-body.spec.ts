/**
 * Multiple bodies in one document (ADR 0012). Items panel actions must reach the viewport: hidden
 * bodies are neither drawn nor pickable, removed ones are gone, names stick, Delete removes a
 * picked body and Split turns one into two. The second body comes from Cmd+D, which places it
 * beside the original.
 */

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  addBox,
  afterFrames,
  BOX,
  canvasRect,
  expectSaid,
  openApp,
  openItems,
  pickAt,
  railButton,
  screenPointOf,
  shiftPickAt,
} from '../app.js';
import { expect, test } from '../fixtures.js';

/** The centre of the box's top face; only the first body is there. */
const TOP = { x: (BOX.min.x + BOX.max.x) / 2, y: (BOX.min.y + BOX.max.y) / 2, z: BOX.max.z };

async function twoBodies(page: Page) {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await page.locator('.body-row', { hasText: 'Body 1' }).click();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(page.locator('.body-row')).toHaveText(['Body 1', 'Body 2']);
}

test('a duplicate is a body of its own, beside the original', async ({ page }) => {
  await twoBodies(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Duplicate']);
  await expect(page.locator('.items-section')).toHaveText(['Bodies', 'History']);
  expect(await pickAt(page, TOP)).not.toBeNull();
});

test('a hidden body is not drawn, and undo brings it back', async ({ page }) => {
  await twoBodies(page);

  await page.getByRole('button', { name: 'Hide Body 1' }).click();
  await expect(page.locator('.body-row', { hasText: 'Body 1' })).toBeDisabled();
  expect(await pickAt(page, TOP)).toBeNull();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.body-row', { hasText: 'Body 1' })).toBeEnabled();
  expect(await pickAt(page, TOP)).not.toBeNull();
});

test('a body is removed as a step in the history', async ({ page }) => {
  await twoBodies(page);
  await page.getByRole('button', { name: 'Remove Body 2' }).click();
  await expect(page.locator('.body-row')).toHaveText(['Body 1']);
  await expect(page.locator('.items-row')).toHaveText([
    'Sketch 1',
    'Extrude',
    'Duplicate',
    'Remove Body 2',
  ]);
});

test('Delete removes a picked body, and a face only where the body can close over it', async ({
  page,
}) => {
  await twoBodies(page);
  // Delete on a face removes the face, not the body. A box's top cannot be removed (the sides
  // cannot close over it), so it says so and leaves both bodies unchanged.
  await pickAt(page, TOP);
  await page.keyboard.press('Delete');
  await expect(page.getByText('cannot close the gap')).toBeVisible();
  await expect(page.locator('.body-row')).toHaveCount(2);

  await page.locator('.body-row', { hasText: 'Body 2' }).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.body-row')).toHaveText(['Body 1']);
});

test('a body can be named, and the name is undone like any edit', async ({ page }) => {
  await twoBodies(page);
  await page.locator('.body-row', { hasText: 'Body 2' }).dblclick();
  const field = page.getByRole('textbox', { name: 'Rename Body 2' });
  await field.fill('Lid');
  await field.press('Enter');
  await expect(page.locator('.body-row')).toHaveText(['Body 1', 'Lid']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.body-row')).toHaveText(['Body 1', 'Body 2']);
});

test('Split cuts a picked body in two, with its plane in the panel', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await page.locator('.body-row', { hasText: 'Body 1' }).click();
  await page.keyboard.press('k');
  await expect(page.locator('.items-row', { hasText: 'Split' })).toBeVisible();
  await expect(page.locator('.body-row')).toHaveCount(2);
  await expect(page.locator('.inspector .move-gizmo__heading strong')).toHaveText('Split');
  await expect(page.locator('.inspector').getByLabel('Offset')).toHaveValue('7.5');
});

test('combine says what to pick when fewer than two bodies are picked', async ({ page }) => {
  await twoBodies(page);
  await page.locator('.body-row', { hasText: 'Body 1' }).click();
  await page.keyboard.press('ControlOrMeta+u');
  await expect(page.getByText('Select two bodies')).toBeVisible();
  await expect(page.locator('.items-row', { hasText: 'Combine' })).toHaveCount(0);
});

test('moving with several bodies and nothing picked asks which', async ({ page }) => {
  await twoBodies(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await expectSaid(page, 'Select the body to move first.');
});

test('Split along a picked face takes a lid off the part', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  // The first pick selects the part, the second the face to split along.
  await pickAt(page, { x: 20, y: 0, z: 7 });
  await shiftPickAt(page, { x: 20, y: 10, z: 15 });
  await page.keyboard.press('k');
  await openItems(page);
  await expect(page.locator('.items-row', { hasText: 'Split' })).toBeVisible();
  await expect(page.locator('.body-row')).toHaveCount(2);
  await expect(page.locator('.inspector').getByLabel('Offset')).toHaveValue('-1');
});

test('Mirror and Pattern add copies of the picked part', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await page.locator('.body-row', { hasText: 'Body 1' }).click();
  const transform = async (name: string) => {
    const button = railButton(page, name);
    if (!(await button.isVisible())) await railButton(page, 'Transform').click();
    await button.click();
    await expect(page.locator('html[data-busy]')).toHaveCount(0);
  };
  await transform('Mirror');
  await expect(page.locator('.items-row', { hasText: 'Mirror' })).toBeVisible();
  await expect(page.locator('.body-row')).toHaveCount(2);

  await page.locator('.body-row', { hasText: 'Body 1' }).click();
  await transform('Pattern');
  await expect(page.locator('.items-row', { hasText: 'Pattern' })).toBeVisible();
  await expect(page.locator('.body-row')).toHaveCount(4);
  await page.locator('.inspector').getByLabel('Count').fill('5');
  await expect(page.locator('.body-row')).toHaveCount(6);
});

test('Align sets one body on another, face to face (audit F-066)', async ({ page }) => {
  await twoBodies(page);
  // Both bodies in view, framed from the starting camera: the copy stands 50 mm along X.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+F');
  const both = { min: BOX.min, max: { ...BOX.max, x: BOX.max.x + 50 } };
  const click = async (world: { x: number; y: number; z: number }, shift = false) => {
    const point = screenPointOf(await canvasRect(page), world, both);
    await afterFrames(page);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    if (shift) await page.keyboard.up('Shift');
    await page.waitForTimeout(120);
  };
  // The original's top, then the copy's: the original flips and stands on the copy, so nothing is
  // left to pick where its top was.
  await click(TOP);
  await click({ x: 70, y: 10, z: 15 }, true);
  await expect(page.locator('.selection code')).toHaveCount(2);
  const align = railButton(page, 'Align');
  if (!(await align.isVisible())) await railButton(page, 'Transform').click();
  await align.click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row', { hasText: 'Align' })).toBeVisible();
  await expect(page.locator('.body-row')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await click(TOP);
  await expect(page.locator('.selection code')).toHaveCount(0);
});

test('a right-click lists the bodies under it, the hidden one too (audit F-060)', async ({
  page,
}) => {
  await twoBodies(page);
  await page.keyboard.press('Escape');
  // Looking along X from the right, the copy stands in front of the original and hides it.
  await page.keyboard.press('ControlOrMeta+6');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  const box = await canvasRect(page);
  const list = page.getByRole('menu', { name: 'Select through this point' });
  // Retry until the camera finishes turning to the right view.
  await expect(async () => {
    if ((await list.count()) > 0) await page.keyboard.press('Escape');
    await afterFrames(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await expect(list.getByRole('menuitem')).toHaveText(['Body 2nearest', 'Body 1'], {
      timeout: 1000,
    });
  }).toPass();
  await list.getByRole('menuitem', { name: 'Body 1' }).click();
  await expect(list).toHaveCount(0);
  await expect(page.locator('.body-row', { hasText: 'Body 1' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.locator('.body-row', { hasText: 'Body 2' })).toHaveAttribute(
    'aria-current',
    'false',
  );
});

test('the history rolls back to a step and forward again, and refuses an impossible move (audit F-052, F-053)', async ({
  page,
}) => {
  await twoBodies(page);
  const row = (name: string) => page.locator('.items-row', { hasText: name });
  await row('Extrude').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Extrude in the history' });
  await expect(menu.getByRole('menuitem', { name: 'Move up' })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Roll back to here' }).click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.history-marker')).toContainText('1 later step paused');
  await expect(page.locator('.body-row')).toHaveCount(1);
  await expect(page.locator('.items-entry[data-paused]')).toHaveText(['DuplicatePaused']);
  await page.locator('.history-marker').getByRole('button', { name: 'Roll forward' }).click();
  await expect(page.locator('.history-marker')).toHaveCount(0);
  await expect(page.locator('.body-row')).toHaveCount(2);
  // The extrude depends on the sketch; moved above it, it would have no input.
  await row('Extrude').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.getByText('Extrude is built on Sketch 1')).toBeVisible();
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Duplicate']);
});

test('a joint turns or slides one part on another, and the bill of materials counts equal parts (audit F-054)', async ({
  page,
}) => {
  await twoBodies(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+F');
  const both = { min: BOX.min, max: { ...BOX.max, x: BOX.max.x + 50 } };
  const click = async (world: { x: number; y: number; z: number }, shift = false) => {
    const point = screenPointOf(await canvasRect(page), world, both);
    await afterFrames(page);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    if (shift) await page.keyboard.up('Shift');
    await page.waitForTimeout(120);
  };
  await click({ x: 70, y: 10, z: 15 });
  await click(TOP, true);
  const joint = railButton(page, 'Joint');
  if (!(await joint.isVisible())) await railButton(page, 'Transform').click();
  await joint.click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row', { hasText: 'Joint' })).toBeVisible();
  const inspector = page.locator('.inspector');
  // A revolute joint offers an angle and its limits, not a distance.
  await expect(inspector.getByLabel('Angle', { exact: true })).toBeVisible();
  await expect(inspector.getByLabel('Distance', { exact: true })).toHaveCount(0);
  await inspector.getByLabel('Angle', { exact: true }).fill('90');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(
    page.locator('.items-row', { hasText: 'Joint' }).locator('.items-row__problem'),
  ).toHaveCount(0);
  await inspector.getByLabel('Kind').selectOption('slider');
  await expect(inspector.getByLabel('Distance', { exact: true })).toBeVisible();

  // Export: the two identical boxes are one line with a count of two.
  await page.locator('.titlebar__export').click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /^Bill of materials/ }).click();
  const csv = readFileSync(await (await download).path(), 'utf8');
  expect(csv.split('\n')[1]).toMatch(/^1,Body 1,2,/);
});

test('one body can be isolated, and brought back', async ({ page }) => {
  await twoBodies(page);
  // Alt-click an eye to show only that body; again to show all.
  await page.getByRole('button', { name: 'Hide Body 1' }).click({ modifiers: ['Alt'] });
  await expect(page.getByRole('button', { name: 'Show Body 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide Body 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Hide Body 1' }).click({ modifiers: ['Alt'] });
  await expect(page.getByRole('button', { name: 'Hide Body 2' })).toBeVisible();
});
