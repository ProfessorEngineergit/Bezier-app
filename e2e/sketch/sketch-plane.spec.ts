/**
 * A sketch on an inclined plane: picked like any other, then tilted while drawing, e.g. to draw at
 * 45° between the ground and a wall.
 */

import { addBox, canvasRect, commitExtrude, openApp, openItems, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

test('a sketch tilted to 45° while drawing keeps the tilt and builds from it', async ({ page }) => {
  await openApp(page);
  // Squared to Top, Sketch opens on XY, which still faces the camera after a 45° tilt. Clicking a
  // plane in the middle could pick one the tilt turns edge-on.
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);

  const panel = page.getByRole('complementary', { name: 'Sketch plane' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('XY plane');
  const tilt = panel.getByLabel('Tilt');
  await tilt.fill('45');
  await tilt.press('Enter');
  await expect(tilt).toHaveValue('45');

  await railButton(page, 'Line').click();
  const left = rect.x + rect.width * 0.42;
  const right = rect.x + rect.width * 0.58;
  const top = rect.y + rect.height * 0.42;
  const bottom = rect.y + rect.height * 0.58;
  for (const [x, y] of [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ] as const)
    await page.mouse.click(x, y);
  // Four loose lines: the bar shows the remaining freedoms.
  await expect(panel).toContainText(/\d+ freedoms left/);

  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('e');
  await commitExtrude(page, '5');

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await page.locator('.items-row', { hasText: 'Sketch 1' }).click();
  await expect(page.locator('.inspector').getByLabel('Tilt')).toHaveValue('45');
});

test('Intersection brings in where the part meets the sketch plane', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await page.keyboard.press('Escape');
  // Front squares the view to XZ, the plane of the box's 40 × 15 side.
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await railButton(page, 'Sketch').click();
  const panel = page.getByRole('complementary', { name: 'Sketch plane' });
  await expect(panel).toContainText('XZ plane');
  // XZ faces -Y, so a negative offset moves it into the 20 mm deep box.
  const offset = panel.getByLabel('Offset');
  await offset.fill('-10');
  await offset.press('Enter');
  await railButton(page, 'Intersection').click();
  const lengths = page.getByLabel(/^Length for sketch line /);
  await expect(lengths).toHaveCount(4);
  const values = await lengths.evaluateAll((fields) =>
    fields.map((field) => Number((field as HTMLInputElement).value)).sort((a, b) => a - b),
  );
  expect(values).toEqual([15, 15, 40, 40]);
});

test('the view between top and front sketches on the plane leaning 45° to face it, not on XY', async ({
  page,
}) => {
  await openApp(page);
  // Start from a square view, so a leftover plane would show.
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.getByRole('button', { name: /^View from (top, front|front, top)$/ }).click();
  await page.waitForTimeout(700);
  await railButton(page, 'Sketch').click();
  const panel = page.getByRole('complementary', { name: 'Sketch plane' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Tilt')).toHaveValue('45');
  // While sketching, the view cube's edges set the plane the same way. Use the keyboard: from top
  // and front, the front-right edge is a few pixels wide under the cube's faces, so a pointer would
  // hit a face.
  const edge = page.getByRole('button', { name: /^View from (front, right|right, front)$/ });
  await edge.focus();
  await edge.press('Enter');
  await expect(panel).toContainText('XZ plane');
  await expect(panel.getByLabel('Turn')).toHaveValue(/^-?45$/);
});
