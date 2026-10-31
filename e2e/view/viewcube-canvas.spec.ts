/**
 * The orientation cube is one canvas (`apps/studio/src/view-cube-canvas.ts`), the same on every
 * system. Clicking a face turns the view there, and the area around the cube still reaches the
 * model.
 */

import { canvasRect, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

test('the cube is one canvas, and a click on it turns the view', async ({ page }) => {
  await openApp(page);
  const cube = page.locator('.viewcube__canvas');
  await expect(cube).toBeVisible();
  // Faces, edges and corners are also hidden buttons, for the keyboard.
  await expect(page.locator('.viewcube__face')).toHaveCount(6);
  await expect(page.locator('.viewcube__zone')).toHaveCount(20);

  // A project opens on the angled view, with the corner face in the middle of the cube. Clicking it
  // squares the view onto that corner, which shows the quarter-turn arrows.
  const box = await cube.boundingBox();
  if (box === null) throw new Error('the cube has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.viewcube--squared')).toHaveCount(1);
});

test('the room round the cube lets the pointer through to the model', async ({ page }) => {
  await openApp(page);
  const box = await page.locator('.viewcube__canvas').boundingBox();
  if (box === null) throw new Error('the cube has no box');
  // Inside the canvas but off the cube, the pointer passes through to the viewport.
  await page.mouse.move(box.x + 3, box.y + 3);
  await expect(page.locator('.viewcube__canvas')).toHaveCSS('pointer-events', 'none');
  const rect = await canvasRect(page);
  expect(rect.width).toBeGreaterThan(0);
});
