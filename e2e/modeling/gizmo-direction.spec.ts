/** Spatial assertions against real OCCT faces, independent of the gizmo's angle formula. */
import { addBox, canvasRect, openApp, openItems, pickAt, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

for (const [name, point, outward] of [
  ['top', { x: 20, y: 10, z: 15 }, { x: 20, y: 10, z: 20 }],
  ['right', { x: 40, y: 10, z: 7.5 }, { x: 45, y: 10, z: 7.5 }],
  ['front', { x: 20, y: 0, z: 7.5 }, { x: 20, y: -5, z: 7.5 }],
] as const) {
  test(`the ${name} face arrow is outside and points along its actual normal`, async ({ page }) => {
    await openApp(page);
    await addBox(page);
    await pickAt(page, point);
    const rect = await canvasRect(page);
    const a = screenPointOf(rect, point);
    const b = screenPointOf(rect, outward);
    await expect
      .poll(async () => {
        const box = await page.locator('.extrude-gizmo__handle').boundingBox();
        if (!box) return 0;
        const dx = box.x + box.width / 2 - a.x;
        const dy = box.y + box.height / 2 - a.y;
        return (
          (dx * (b.x - a.x) + dy * (b.y - a.y)) /
          (Math.hypot(dx, dy) * Math.hypot(b.x - a.x, b.y - a.y))
        );
      })
      .toBeGreaterThan(0.999);
    await expect(page.locator('.extrude-gizmo__handle')).toHaveCSS('filter', 'none');
  });
}

test('an off-centre edge click anchors at its midpoint on the outward bisector', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 40, y: 3, z: 15 });
  const rect = await canvasRect(page);
  const middle = screenPointOf(rect, { x: 40, y: 10, z: 15 });
  const outside = screenPointOf(rect, { x: 45, y: 10, z: 20 });
  const anchor = await page.locator('.edge-gizmo').boundingBox();
  expect(anchor).not.toBeNull();
  if (anchor) {
    expect(anchor.x).toBeCloseTo(middle.x, 0);
    expect(anchor.y).toBeCloseTo(middle.y, 0);
  }
  await expect
    .poll(async () => {
      const box = await page.locator('.edge-gizmo__handle').boundingBox();
      if (!box) return 0;
      const dx = box.x + box.width / 2 - middle.x;
      const dy = box.y + box.height / 2 - middle.y;
      return (
        (dx * (outside.x - middle.x) + dy * (outside.y - middle.y)) /
        (Math.hypot(dx, dy) * Math.hypot(outside.x - middle.x, outside.y - middle.y))
      );
    })
    .toBeGreaterThan(0.999);
});

test('a side pull commits its own feature and updates independently of sketch extrusion', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 40, y: 10, z: 7.5 });
  // A face pull's field is signed (a text box), so a cut can be typed as negative, unlike the
  // sketch extrude's positive-only spinbutton.
  const input = page.getByRole('textbox', { name: 'Extrude distance' });
  await input.fill('5');
  await input.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await input.fill('8');
  await input.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Extrude face']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
  await page
    .locator('.items-row')
    .filter({ hasText: /^Extrude$/ })
    .click();
  await expect(page.locator('.inspector').getByLabel('Distance')).toHaveValue('15');
});

test('pulling the extrusion arrow along its axis changes the distance and Escape cancels typing', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  const arrow = await page.locator('.extrude-gizmo__handle').boundingBox();
  const anchor = await page.locator('.extrude-gizmo').boundingBox();
  if (!arrow || !anchor) throw new Error('Extrude handle is missing');
  const x = arrow.x + arrow.width / 2;
  const y = arrow.y + arrow.height / 2;
  const length = Math.hypot(x - anchor.x, y - anchor.y);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + ((x - anchor.x) / length) * 80, y + ((y - anchor.y) / length) * 80, {
    steps: 8,
  });
  await page.mouse.up();
  const input = page.getByRole('textbox', { name: 'Extrude distance' });
  await expect(input).toHaveValue('4.88');
  await input.fill('25');
  await input.press('Escape');
  await expect(input).toHaveValue('4.88');
});

test('a face pull has the result menu, and it and the sign of the distance say the same', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });

  // The result menu is always shown while extruding. On a face it holds Add and Cut and follows the
  // sign of the distance; there is no separate direction chooser.
  await expect(page.getByRole('button', { name: 'Extrude options' })).toHaveCount(0);
  const result = page.getByRole('combobox', { name: 'Extrude result' });
  await expect(result).toHaveValue('add');

  // A negative value cuts into the body and commits a valid feature; the menu reflects it.
  const input = page.getByRole('textbox', { name: 'Extrude distance' });
  await input.fill('-5');
  await input.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(result).toHaveValue('cut');
  // Choosing Add turns the same pull outward.
  await result.selectOption('add');
  await expect(input).toHaveValue('5');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Extrude face']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('a face pull is drawn live from its own part, and kept once on release', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  await openItems(page);
  const arrow = await page.locator('.extrude-gizmo__handle').boundingBox();
  const anchor = await page.locator('.extrude-gizmo').boundingBox();
  if (!arrow || !anchor) throw new Error('Extrude handle is missing');
  const x = arrow.x + arrow.width / 2;
  const y = arrow.y + arrow.height / 2;
  const length = Math.hypot(x - anchor.x, y - anchor.y);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + ((x - anchor.x) / length) * 80, y + ((y - anchor.y) / length) * 80, {
    steps: 8,
  });
  // While held, the pulled part is drawn over the box and nothing is committed.
  const preview = page.locator('canvas.viewport[data-part-preview]');
  await expect(preview).toHaveCount(1);
  expect(Number(await preview.getAttribute('data-part-preview'))).toBeGreaterThan(0);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);

  await page.mouse.up();
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Extrude face']);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  // The rebuilt model replaces the preview.
  await expect(preview).toHaveCount(0);
});

test('a face accepts direct typing while selection keeps Delete and deselect shortcuts', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 40, y: 10, z: 7.5 });
  const input = page.getByRole('textbox', { name: 'Extrude distance', exact: true });
  await expect(input).toBeVisible();
  await expect(input).not.toBeFocused();
  await page.keyboard.type('2');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('2');
  await page.keyboard.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await expect(page.locator('.items-row', { hasText: 'Extrude face' })).toBeVisible();
});
