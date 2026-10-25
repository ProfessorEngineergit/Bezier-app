/**
 * The Hole command: click a flat face, choose Hole, and the part is drilled at the click point;
 * its size and style can then be edited.
 */

import { addBox, expectSaid, openApp, openItems, pickAt, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

/** Tools is a flyout that stays open after a command, so open it only if it is closed. */
async function hole(page: import('@playwright/test').Page) {
  const button = railButton(page, 'Hole');
  if (!(await button.isVisible())) await railButton(page, 'Tools').click();
  await button.click();
}

test('Hole drills the clicked face, and its style can be changed', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  await hole(page);
  await openItems(page);
  await expect(page.locator('.items-row', { hasText: 'Hole' })).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  const inspector = page.locator('.inspector');
  await expect(inspector.locator('.move-gizmo__heading strong')).toHaveText('Hole');
  await expect(inspector.getByLabel('Diameter', { exact: true })).toHaveValue('5');
  await inspector.getByLabel('Style').selectOption('counterbore');
  await expect(page.getByText('Hole could not be created')).toHaveCount(0);
  await expect(page.locator('.items-row', { hasText: 'Hole' })).not.toHaveAttribute(
    'data-state',
    'failed',
  );
});

test('Hole without a face says what to click', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await page.keyboard.press('Escape');
  await hole(page);
  await expectSaid(page, 'Click the flat face to drill into first.');
});

test('clicking the existing hole wall edits its radius and remains editable afterwards', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  await hole(page);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await pickAt(page, { x: 18.5, y: 12, z: 13.5 });
  const radius = page.getByRole('spinbutton', { name: 'Cylinder radius', exact: true });
  await expect(radius).toHaveValue('2.5');
  await radius.fill('3.5');
  await radius.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(radius).toHaveValue('3.5');
  await page.keyboard.press('Escape');
  await pickAt(page, { x: 17.9, y: 12.8, z: 13.5 });
  await expect(radius).toHaveValue('3.5');
  await radius.fill('2');
  await radius.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // A small bore's visible wall can be narrower than the edge tolerance, so switch to face
  // filtering to pick the wall instead of the rim.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Selecting Faces · Tab to change' })).toBeVisible();
  await pickAt(page, { x: 18.8, y: 11.6, z: 13.5 });
  await expect(radius).toHaveValue('2');
  await page.screenshot({ path: test.info().outputPath('hole-radius.png') });
});
