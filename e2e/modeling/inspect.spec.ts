/** Browser-owned inspection tools: section clipping and point measurements. */

import { addBox, canvasRect, openApp, openItems, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

test('Section View starts through the model instead of clipping it all away', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await page.waitForTimeout(120);
  const canvas = page.locator('canvas.viewport');
  const before = await canvas.screenshot();

  await railButton(page, 'Section View').click();
  await expect(railButton(page, 'Section View')).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(120);
  const sectioned = await canvas.screenshot();
  expect(sectioned.equals(before)).toBe(false);

  await railButton(page, 'Section View').click();
  await expect(railButton(page, 'Section View')).toHaveAttribute('aria-current', 'false');
});

test('Measure reports total and axis distances and can be cleared', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Measure').click();
  await expect(railButton(page, 'Measure')).toHaveAttribute('aria-current', 'true');

  const panel = page.getByRole('complementary', { name: 'Measurements' });
  await expect(panel).toContainText('Select two points');
  // Move the floating panel out of the part's right side before measuring it.
  const grip = panel.getByRole('button', { name: 'Move Measure panel' });
  await grip.focus();
  for (let i = 0; i < 22; i++) await grip.press('Shift+ArrowLeft');

  const rect = await canvasRect(page);
  const first = screenPointOf(rect, { x: 20, y: 10, z: 15 });
  const second = screenPointOf(rect, { x: 40, y: 10, z: 7.5 });
  await page.mouse.click(first.x, first.y);
  await expect(panel).toContainText('Select second point');
  await page.mouse.click(second.x, second.y);

  await expect(panel.locator('.measure-result dd')).toHaveText('21.36 mm');
  // The value itself is a button that copies the reading, typically into a field or message.
  await expect(panel.getByRole('button', { name: /^Copy distance: 21.36 mm/ })).toBeVisible();
  await panel.getByRole('switch').check();
  await expect(panel.locator('.measure-deltas dd')).toHaveText(['20 mm', '0 mm', '-7.5 mm']);

  // SVG and WebGL share coordinates, including the canvas area beneath the title bar.
  const marker = page.locator('.measure-overlay circle').nth(8);
  const box = await marker.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x + box.width / 2).toBeCloseTo(first.x, 0);
    expect(box.y + box.height / 2).toBeCloseTo(first.y, 0);
  }
  await page.mouse.dblclick(first.x, first.y);
  await expect(panel.locator('.measure-result dd')).toHaveText('21.36 mm');
  await expect(page.locator('.move-gizmo')).toHaveCount(0);

  await panel.getByRole('button', { name: 'Pin measurement' }).click();
  await panel.getByRole('button', { name: 'New measurement' }).click();
  await expect(panel).toContainText('Select two points');
  await panel.getByRole('button', { name: 'Exit Measure', exact: true }).click();
  await expect(panel).toHaveCount(0);
  // The chord passes through the solid: keep the numeric result in the panel, but do not draw its
  // hidden span through the body after pinning.
  await expect(page.locator('.measure-overlay line:visible')).toHaveCount(0);
  await railButton(page, 'Measure').click();
  await page.getByRole('button', { name: 'Unpin measurement 1' }).click();
  await expect(page.getByRole('region', { name: 'Pinned measurements' })).toContainText('Pinned 0');
});

test('a pinned surface measurement is occluded from below and returns from above', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Measure').click();
  const panel = page.getByRole('complementary', { name: 'Measurements' });
  const grip = panel.getByRole('button', { name: 'Move Measure panel' });
  await grip.focus();
  for (let i = 0; i < 22; i++) await grip.press('Shift+ArrowLeft');
  const rect = await canvasRect(page);
  for (const x of [20, 30]) {
    const point = screenPointOf(rect, { x, y: 10, z: 15 });
    await page.mouse.click(point.x, point.y);
  }
  await panel.getByRole('button', { name: 'Pin measurement' }).click();
  await panel.getByRole('button', { name: 'New measurement' }).click();
  await panel.getByRole('button', { name: 'Exit Measure', exact: true }).click();
  await expect(page.locator('.measure-overlay text')).toBeVisible();
  // Keyboard activation avoids the CSS cube's rear-face hit-target bug (tracked separately).
  await page.getByRole('button', { name: 'Bottom', exact: true }).press('Enter');
  await expect(page.locator('.measure-overlay text')).toBeHidden();
  await expect(page.locator('.measure-overlay circle').nth(8)).toBeHidden();
  await page
    .locator('canvas.viewport')
    .screenshot({ path: test.info().outputPath('astra-clean-underside.png') });
  await page.getByRole('button', { name: 'Top', exact: true }).press('Enter');
  await expect(page.locator('.measure-overlay text')).toBeVisible();
});

test('section position validates edits, cancels drafts, and recenters the real cut', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Section View').click();
  const panel = page.getByRole('complementary', { name: 'Section View' });
  const position = panel.getByRole('textbox', { name: 'Z position' });
  await expect(position).toHaveValue('7.5');
  await position.fill('5');
  await position.press('Enter');
  await expect(position).toHaveValue('5');
  await position.fill('bad');
  await position.press('Enter');
  await expect(position).toHaveAttribute('aria-invalid', 'true');
  await position.press('Escape');
  await expect(position).toHaveValue('5');
  await expect(position).toHaveAttribute('aria-invalid', 'false');
  await panel.getByRole('button', { name: 'Center on model' }).click();
  await expect(position).toHaveValue('7.5');
  await panel.getByRole('button', { name: 'Exit Section View' }).click();
  await expect(railButton(page, 'Section View')).toHaveAttribute('aria-current', 'false');
});

test('the section height can be dragged, and a click still lets it be typed', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Section View').click();
  const field = page.locator('.section-position input');
  await expect(field).toHaveCSS('cursor', 'ns-resize');
  // Wait for the start value to settle: the section default is computed once the model is
  // measured, and a slow machine could read 0 before 7.5 arrives.
  let start = Number.NaN;
  await expect
    .poll(
      async () => {
        const now = Number(await field.inputValue());
        const settled = now === start;
        start = now;
        return settled;
      },
      { intervals: [300] },
    )
    .toBe(true);

  // Dragging up raises it: 40 pixels at half a millimetre each.
  const box = await field.boundingBox();
  if (box === null) throw new Error('the section field is not on screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 20, { steps: 4 });
  await page.mouse.move(x, y - 40, { steps: 4 });
  await page.mouse.up();
  await expect(field).toHaveValue(String(start + 20));
  // A drag is not an edit: the field still shows the resize cursor, not a caret.
  await expect(field).toHaveCSS('cursor', 'ns-resize');

  // A press without movement is a click: the field takes the caret.
  await page.mouse.click(x, y);
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS('cursor', 'text');
  await field.fill('3');
  await field.press('Enter');
  await expect(field).toHaveValue('3');
});

test('Measure gives the picked body its volume and surface (audit F-001)', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await page.locator('.body-row', { hasText: 'Body 1' }).click();
  await railButton(page, 'Measure').click();
  const body = page.getByRole('region', { name: 'Body measurements' });
  // The starter box is 40 × 20 × 15.
  await expect(body).toContainText('12000 mm³');
  await expect(body).toContainText(`${2 * (40 * 20 + 40 * 15 + 20 * 15)} mm²`);
});

test('a third point gives the angle at the second (audit F-028)', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Measure').click();
  const panel = page.getByRole('complementary', { name: 'Measurements' });
  const grip = panel.getByRole('button', { name: 'Move Measure panel' });
  await grip.focus();
  for (let i = 0; i < 22; i++) await grip.press('Shift+ArrowLeft');
  const rect = await canvasRect(page);
  for (const point of [
    { x: 30, y: 10, z: 15 },
    { x: 20, y: 10, z: 15 },
    { x: 20, y: 15, z: 15 },
  ]) {
    const at = screenPointOf(rect, point);
    await page.mouse.click(at.x, at.y);
  }
  await expect(panel.locator('.measure-angle dd')).toContainText('°');
});
