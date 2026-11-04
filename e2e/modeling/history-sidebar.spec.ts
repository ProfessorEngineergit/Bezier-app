/**
 * The History sidebar: the steps down the right side, with a playhead that rolls the model back.
 * The cube moves to the panel's left, the one time it moves, and comes back.
 */

import type { Page } from '@playwright/test';
import { addBox, canvasRect, openApp, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

const EDGE = { x: 40, y: 10, z: 15 };
const triangles = (page: Page) => page.locator('canvas.viewport').getAttribute('data-triangles');
const panel = (page: Page) => page.getByRole('complementary', { name: 'History' });
const settled = (page: Page) => expect(page.locator('html[data-busy]')).toHaveCount(0);

async function rounded(page: Page) {
  await openApp(page);
  await addBox(page);
  const at = screenPointOf(await canvasRect(page), EDGE);
  await page.mouse.click(at.x, at.y);
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('2');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  await settled(page);
  await page.keyboard.press('Escape');
  await railButton(page, 'History').click();
  await expect(panel(page)).toBeVisible();
}

test('it opens on the right, and the cube and the rail make room', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const cube = page.locator('.viewcube');
  const before = await cube.boundingBox();
  await railButton(page, 'History').click();
  const box = await panel(page).boundingBox();
  const moved = await cube.boundingBox();
  if (before === null || box === null || moved === null) throw new Error('nothing on screen');
  expect(box.x + box.width).toBeGreaterThan((await canvasRect(page)).width * 0.9);
  // The cube, its turn arrows and the rail all stay clear of the panel.
  expect(moved.x + moved.width).toBeLessThan(box.x - 32);
  await railButton(page, 'History').click();
  await expect(panel(page)).toHaveCount(0);
  await expect.poll(async () => (await cube.boundingBox())?.x).toBeCloseTo(before.x, 0);
});

test('only Modeling has it', async ({ page }) => {
  await openApp(page);
  await expect(railButton(page, 'History')).toBeVisible();
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  await expect(railButton(page, 'History')).toHaveCount(0);
});

test('stepping rolls the model back, and the document keeps its steps', async ({ page }) => {
  await rounded(page);
  const whole = await triangles(page);
  await expect(panel(page).locator('.items-row')).toHaveCount(3);
  await expect(panel(page).locator('.history-panel__count')).toHaveText('3 / 3');

  await panel(page).getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  await expect.poll(() => triangles(page)).not.toBe(whole);
  await expect(panel(page).locator('.items-entry[data-paused]')).toHaveCount(1);
  await expect(panel(page).locator('.history-panel__count')).toHaveText('2 / 3');

  await panel(page).getByRole('button', { name: 'To the end' }).click();
  await expect(panel(page).locator('.items-entry[data-paused]')).toHaveCount(0);
  await expect.poll(() => triangles(page)).toBe(whole);
  await expect(panel(page).locator('.items-row')).toHaveCount(3);
});

test('play runs from the top down and stops at the whole model', async ({ page }) => {
  await rounded(page);
  const whole = await triangles(page);
  const head = panel(page).getByRole('slider', { name: 'Playhead' });
  await panel(page).getByRole('button', { name: 'Play' }).click();
  await expect(panel(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(head).toHaveAttribute('aria-valuenow', '0');
  await expect(head).toHaveAttribute('aria-valuenow', '1');
  await expect(head).toHaveAttribute('aria-valuenow', '2');
  await expect(panel(page).getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 15_000 });
  await expect(head).toHaveAttribute('aria-valuenow', '3');
  await expect.poll(() => triangles(page)).toBe(whole);
});

test('pause holds where it is, and play goes on from there', async ({ page }) => {
  await rounded(page);
  const head = panel(page).getByRole('slider', { name: 'Playhead' });
  await panel(page).getByRole('button', { name: 'To the start' }).click();
  await settled(page);
  await panel(page).getByRole('button', { name: 'Play' }).click();
  await expect(head).toHaveAttribute('aria-valuenow', '1');
  await panel(page).getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(1000);
  await expect(head).toHaveAttribute('aria-valuenow', '1');
  await panel(page).getByRole('button', { name: 'Play' }).click();
  await expect(head).toHaveAttribute('aria-valuenow', '3', { timeout: 15_000 });
});

test('the playhead is dragged between the steps, and takes the keyboard', async ({ page }) => {
  await rounded(page);
  const head = panel(page).getByRole('slider', { name: 'Playhead' });
  const start = await head.boundingBox();
  const row = await panel(page).locator('.items-entry').nth(1).boundingBox();
  if (start === null || row === null) throw new Error('the list is not on screen');
  await page.mouse.move(start.x + 40, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, row.y + 2, { steps: 6 });
  await expect(panel(page).locator('.items-entry[data-paused]')).toHaveCount(2);
  await page.mouse.up();
  await settled(page);
  await expect(head).toHaveAttribute('aria-valuenow', '1');

  await head.focus();
  await page.keyboard.press('ArrowDown');
  await expect(head).toHaveAttribute('aria-valuenow', '2');
});

test('the list keeps the playhead in view while it runs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await rounded(page);
  const body = panel(page).locator('.history-panel__body');
  await panel(page).getByRole('button', { name: 'To the start' }).click();
  await settled(page);
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
  await panel(page).getByRole('button', { name: 'To the end' }).click();
  const head = panel(page).getByRole('slider', { name: 'Playhead' });
  await expect(head).toBeInViewport();
});

test('an open sketch holds the controls: the model must not move under it', async ({ page }) => {
  await rounded(page);
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Play' })).toBeDisabled();
});

test('a timelapse opens each tool, draws the sketch and builds the part', async ({ page }) => {
  await rounded(page);
  const whole = await triangles(page);
  await panel(page).getByRole('button', { name: 'Timelapse' }).click();
  await panel(page).getByRole('button', { name: 'Play timelapse' }).click();

  // The sketch: the rail turns into the sketch tools with the one in use lit, then Finish.
  await expect(railButton(page, 'Finish Sketch')).toBeVisible();
  await expect(railButton(page, 'Rectangle')).toHaveAttribute('aria-current', 'true');
  // The round: Tools opens with its command lit.
  await expect(page.locator('.rail__flyout').getByText('Chamfer/Fillet').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(panel(page).getByRole('button', { name: 'Play timelapse' })).toBeVisible({
    timeout: 15_000,
  });
  // The rail is back to what was really open.
  await expect(railButton(page, 'Finish Sketch')).toHaveCount(0);
  await expect(panel(page).locator('.history-panel__count')).toHaveText('3 / 3');
  await expect.poll(() => triangles(page)).toBe(whole);
});

test('a press in the model ends a timelapse where it is', async ({ page }) => {
  await rounded(page);
  await panel(page).getByRole('button', { name: 'Timelapse' }).click();
  await panel(page).getByRole('button', { name: 'Play timelapse' }).click();
  await expect(railButton(page, 'Finish Sketch')).toBeVisible();
  await page.mouse.click(600, 300);
  await expect(railButton(page, 'Finish Sketch')).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Play timelapse' })).toBeVisible();
});

test('the pointer on a step lights what it made', async ({ page }) => {
  await rounded(page);
  const canvas = page.locator('canvas.viewport');
  await panel(page).locator('.items-row').nth(2).hover();
  await expect(canvas).toHaveAttribute('data-step-hover', /^[1-9]/);
  await panel(page).locator('.history-panel__head').hover();
  await expect(canvas).not.toHaveAttribute('data-step-hover');
});

test('a step clicked is where the model stands, and the last one is the whole model', async ({
  page,
}) => {
  await rounded(page);
  const whole = await triangles(page);
  await panel(page).locator('.items-row', { hasText: 'Extrude' }).click();
  await settled(page);
  await expect(panel(page).locator('.history-panel__count')).toHaveText('2 / 3');
  await expect.poll(() => triangles(page)).not.toBe(whole);
  // Its settings are open to change it there.
  await expect(page.getByLabel('Distance', { exact: true })).toBeVisible();

  await panel(page).locator('.items-row', { hasText: 'Fillet' }).click();
  await settled(page);
  await expect(panel(page).locator('.history-panel__count')).toHaveText('3 / 3');
  await expect.poll(() => triangles(page)).toBe(whole);
});

test('the cube still turns where it stands with History open', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  // The pointer over the cube before it moves aside, as a person's would be.
  const home = await page.locator('.viewcube__canvas').boundingBox();
  if (home === null) throw new Error('no cube');
  await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2);
  await railButton(page, 'History').click();
  await expect(panel(page)).toBeVisible();
  await page.waitForTimeout(400);
  const cube = await page.locator('.viewcube__canvas').boundingBox();
  if (cube === null) throw new Error('no cube');
  const before = await page.locator('canvas.viewport').screenshot();
  await page.mouse.move(cube.x + cube.width / 2, cube.y + cube.height / 2);
  await page.mouse.down();
  await page.mouse.move(cube.x + cube.width / 2 + 60, cube.y + cube.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => Buffer.compare(await page.locator('canvas.viewport').screenshot(), before))
    .not.toBe(0);
});
