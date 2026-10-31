/**
 * Sketch mode: it asks for a plane before anything is drawn. The mode replaces the rail, offers the
 * three datum planes at the origin, holds the picked one (which decides where geometry lands) and
 * forgets it on exit.
 */

import {
  canvasRect,
  commitExtrude,
  openApp,
  openItems,
  quickSettings,
  railButton,
} from '../app.js';
import { expect, test } from '../fixtures.js';

/** The exit row's second line carries the chosen plane, or the prompt to pick one. */
function guard(page: import('@playwright/test').Page) {
  return page
    .locator('.rail--left .rail__label', { hasText: 'Finish Sketch' })
    .locator('.rail__detail');
}

test('entering sketch replaces the rail and asks for a plane', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();

  await expect(railButton(page, 'Finish Sketch')).toBeVisible();
  await expect(railButton(page, 'Line')).toBeVisible();
  await expect(guard(page)).toHaveText('No active plane');
});

test('clicking a datum plane makes it the active one', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();

  // The three planes sit at the origin, which the empty view frames at its centre; a click there
  // lands on one of them.
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  // Which plane depends on the camera, so only check that one became active.
  await expect(guard(page)).toHaveText(/^(XY|XZ|YZ) plane$/);
});

test('leaving sketch forgets the plane', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(guard(page)).toHaveText(/plane$/);

  await railButton(page, 'Finish Sketch').click();
  await expect(railButton(page, 'Sketch')).toBeVisible();

  // Re-entering clears the choice: the planes are offered again.
  await railButton(page, 'Sketch').click();
  await expect(guard(page)).toHaveText('No active plane');
});

test('a closed line chain becomes the profile that Extrude builds', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  await expect(guard(page)).toHaveText(/plane$/);
  await page.keyboard.press('l');

  const left = rect.x + rect.width * 0.4;
  const right = rect.x + rect.width * 0.6;
  const top = rect.y + rect.height * 0.4;
  const bottom = rect.y + rect.height * 0.6;
  for (const point of [
    [left + 8, top + 5],
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ] as const) {
    await page.mouse.click(point[0], point[1]);
  }

  await railButton(page, 'Finish Sketch').click();
  await expect(railButton(page, 'Sketch')).toBeVisible();
  await railButton(page, 'Tools').click();
  await railButton(page, 'Extrude').click();
  await commitExtrude(page);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('a line chain that crosses itself offers each of the areas it encloses', async ({ page }) => {
  // A bow tie is read as two closed triangles meeting at the crossing, as in other CAD tools.
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.keyboard.press('l');

  const left = rect.x + rect.width * 0.4;
  const right = rect.x + rect.width * 0.6;
  const top = rect.y + rect.height * 0.4;
  const bottom = rect.y + rect.height * 0.6;
  for (const point of [
    [left, top],
    [right, bottom],
    [left, bottom],
    [right, top],
    [left, top],
  ] as const) {
    await page.mouse.click(point[0], point[1]);
  }

  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.44);

  await expect(page.getByRole('button', { name: 'Drag to change extrude distance' })).toHaveCount(
    1,
  );
  await page.keyboard.press('Escape');
  // E opens the gizmo on the drawing and builds nothing until a distance is given.
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Drag to change extrude distance' })).toBeVisible();
  await commitExtrude(page);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('clicking a finished rectangle profile enters Extrude directly', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Rectangle').click();
  await railButton(page, 'Diagonal').click();
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await expect(page.locator('.sketch-dimension')).toHaveCount(2);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await expect(page.getByRole('textbox', { name: /Length for sketch line/ })).toHaveCount(2);

  await railButton(page, 'Finish Sketch').click();
  await expect(railButton(page, 'Sketch')).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  // Clicking the filled profile is the command: no Tools flyout and no E key.
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Drag to change extrude distance' })).toBeVisible();

  const distance = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await distance.fill('24');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
  await page.locator('.items-row', { hasText: 'Extrude' }).click();
  await expect(page.locator('.inspector').getByLabel('Distance')).toHaveValue('24');
  await page.locator('.inspector').getByLabel('Direction').selectOption('backward');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.inspector').getByLabel('Direction')).toHaveValue('backward');
});

test('grid lock snaps new rectangle dimensions to its configured step', async ({ page }) => {
  await openApp(page);
  await quickSettings(page, 'Units & Grid');
  await page.getByText('Snap to grid').click();
  const gridSize = page.locator('.popover input[type="number"]').first();
  await gridSize.fill('10');
  await gridSize.press('Enter');
  await page.keyboard.press('Escape');

  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Rectangle').click();
  await railButton(page, 'Diagonal').click();
  await page.mouse.click(rect.x + rect.width * 0.41, rect.y + rect.height * 0.43);
  await page.mouse.click(rect.x + rect.width * 0.63, rect.y + rect.height * 0.67);

  const dimensions = page.getByRole('textbox', { name: /Length for sketch line/ });
  await expect(dimensions).toHaveCount(2);
  const values = await dimensions.evaluateAll((inputs) =>
    inputs.map((input) => Number((input as HTMLInputElement).value)),
  );
  expect(
    values.every((value) => value > 0 && Math.abs(value / 10 - Math.round(value / 10)) < 1e-6),
  ).toBe(true);
  // The snap target of the next point is shown beside the pointer (audit F-050): the corner just
  // drawn, and the grid away from it.
  await page.mouse.move(rect.x + rect.width * 0.63, rect.y + rect.height * 0.67);
  await expect(page.locator('.sketch-snap')).toHaveText('Endpoint');
  await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.3);
  await expect(page.locator('.sketch-snap')).toHaveText('Grid');
});

test('Circle draws a diameter, stays editable, and extrudes to a solid', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  await page.keyboard.press('c');
  const center = { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.5 };
  await page.mouse.click(center.x, center.y);
  await page.mouse.move(rect.x + rect.width * 0.62, center.y);
  await expect(page.locator('.sketch-dimension')).toContainText('⌀');
  await page.mouse.click(rect.x + rect.width * 0.62, center.y);

  const diameter = page.getByRole('textbox', { name: /Diameter for sketch circle/ });
  await expect(diameter).toBeVisible();
  await diameter.fill('30');
  await diameter.press('Enter');
  await expect(diameter).toHaveValue('30');

  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  // Clicking the fill offers an extrude without performing it; nothing is added to the document
  // until a distance is given.
  await page.mouse.click(center.x, center.y);
  await expect(page.getByRole('button', { name: 'Drag to change extrude distance' })).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1']);

  const distance = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await distance.fill('12');
  await distance.press('Enter');

  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('a profile offer left alone builds nothing, and Escape takes it back', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Rectangle').click();
  await railButton(page, 'Diagonal').click();
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await expect(page.locator('.sketch-dimension')).toHaveCount(2);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await expect(page.getByRole('textbox', { name: /Length for sketch line/ })).toHaveCount(2);

  await railButton(page, 'Finish Sketch').click();
  await expect(railButton(page, 'Sketch')).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await expect(page.locator('.extrude-gizmo')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.extrude-gizmo')).toHaveCount(0);

  // Declining an offer is not an edit: the document is as the sketch left it, with nothing to undo.
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('Arc closes against a line and extrudes as an exact curved profile', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  const left = { x: rect.x + rect.width * 0.43, y: rect.y + rect.height * 0.54 };
  const right = { x: rect.x + rect.width * 0.57, y: left.y };
  const curve = { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.42 };

  await page.keyboard.press('l');
  await page.mouse.click(left.x, left.y);
  await page.mouse.click(right.x, right.y);
  await page.keyboard.press('Escape');

  await page.keyboard.press('a');
  await page.mouse.click(right.x, right.y);
  await page.mouse.click(left.x, left.y);
  await page.mouse.move(curve.x, curve.y);
  await expect(page.locator('.sketch-dimension[data-live]')).toContainText('R');
  await page.mouse.click(curve.x, curve.y);

  await railButton(page, 'Finish Sketch').click();
  await railButton(page, 'Tools').click();
  await railButton(page, 'Extrude').click();
  await commitExtrude(page);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('Rectangle offers the two rectangles that can be drawn', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  await railButton(page, 'Rectangle').click();
  await expect(railButton(page, 'Center')).toBeEnabled();
  await expect(railButton(page, 'Diagonal')).toBeEnabled();
  await expect(railButton(page, '3 Points')).toHaveCount(0);

  await railButton(page, 'Center').click();
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.click(rect.x + rect.width * 0.62, rect.y + rect.height * 0.64);

  await expect(railButton(page, 'Finish Sketch')).toBeEnabled();
  const rectangleLabel = page
    .locator('.rail--left .rail__label')
    .filter({ hasText: 'Rectangle' })
    .first();
  await expect(rectangleLabel).toContainText('Center');
});

test('Trim closes an overdrawn profile by removing both outside remainders', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  const left = rect.x + rect.width * 0.42;
  const right = rect.x + rect.width * 0.58;
  const outsideLeft = rect.x + rect.width * 0.34;
  const outsideRight = rect.x + rect.width * 0.66;
  const top = rect.y + rect.height * 0.42;
  const bottom = rect.y + rect.height * 0.58;

  // Three sides of a rectangle, then an overlong closing line.
  await page.keyboard.press('l');
  for (const point of [
    [left, top],
    [left, bottom],
    [right, bottom],
    [right, top],
  ] as const) {
    await page.mouse.click(point[0], point[1]);
  }
  await page.keyboard.press('Escape');
  // Escape either drops the open shape and keeps the Line tool, or, once the last click has been
  // solved, drops the tool as well. `l` switches the tool on or off, so it is pressed only when the
  // tool is off.
  if ((await railButton(page, 'Line').getAttribute('aria-current')) !== 'true') {
    await page.keyboard.press('l');
  }
  await expect(railButton(page, 'Line')).toHaveAttribute('aria-current', 'true');
  await page.mouse.click(outsideLeft, top);
  await page.mouse.click(outsideRight, top);
  await page.keyboard.press('Escape');

  await page.keyboard.press('t');
  await expect(railButton(page, 'Trim')).toHaveAttribute('aria-current', 'true');
  await page.mouse.click((outsideLeft + left) / 2, top);
  await page.mouse.click((right + outsideRight) / 2, top);

  await railButton(page, 'Finish Sketch').click();
  await railButton(page, 'Tools').click();
  await railButton(page, 'Extrude').click();
  await commitExtrude(page);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('selecting a sketch line enables Delete and removes only that primitive', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  const start = {
    x: rect.x + rect.width * 0.4,
    y: rect.y + rect.height * 0.5,
  };
  await page.keyboard.press('l');
  await page.mouse.click(start.x, start.y);
  await page.mouse.click(rect.x + rect.width * 0.65, start.y);
  await page.keyboard.press('Escape');
  const dimension = page.getByRole('textbox', { name: /Length for sketch line/ });
  await expect(dimension).toHaveCount(1);

  // The label sits at the midpoint, leaving the endpoint free to select.
  await page.mouse.click(start.x, start.y);
  await page.keyboard.press('Delete');

  await expect(dimension).toHaveCount(0);
});

test('a drawn line shows a millimetre dimension that can be edited directly', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

  await page.keyboard.press('l');
  await page.mouse.click(rect.x + rect.width * 0.42, rect.y + rect.height * 0.5);
  await page.mouse.click(rect.x + rect.width * 0.58, rect.y + rect.height * 0.5);
  await page.keyboard.press('Escape');

  const dimension = page.getByRole('textbox', { name: /Length for sketch line/ });
  await expect(dimension).toBeVisible();
  await expect(dimension.locator('xpath=..')).toContainText('mm');
  await dimension.fill('25');
  await dimension.press('Enter');
  await expect(dimension).toHaveValue('25');

  await railButton(page, 'Finish Sketch').click();
  await expect(railButton(page, 'Finish Sketch')).toHaveCount(0);
  // Lengths belong to the drawing tool, not the model: a finished sketch stays visible for
  // extruding, but its dimensions are hidden.
  await expect(page.locator('.sketch-dimension')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('going home in the middle of a sketch keeps the sketch, and the new project with it', async ({
  page,
}) => {
  // The first drawing in a new project, left through Home rather than Finish Sketch. The project
  // must not count as untouched and be deleted with the drawing.
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Rectangle').click();
  await railButton(page, 'Diagonal').click();
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await expect(page.getByRole('textbox', { name: /Length for sketch line/ })).toHaveCount(2);

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  const tile = page.locator('.tile__face');
  await expect(tile).toHaveCount(1);

  await tile.click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await openItems(page);
  await expect(
    page.locator('.items-panel').getByText('Sketch', { exact: false }).first(),
  ).toBeVisible();
});
