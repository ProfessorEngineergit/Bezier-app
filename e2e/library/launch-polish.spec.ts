import { addBox, canvasRect, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

async function drawings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
}

test('sheets keep independent source choices and metadata after reopening the project', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await drawings(page);
  await railButton(page, 'Items').click();
  await page.getByLabel('Drawn by', { exact: true }).fill('First author');
  await page.getByRole('button', { name: 'Add sheet', exact: true }).click();
  // A new sheet inherits the title-block template, then edits it independently.
  await expect(page.getByLabel('Drawn by', { exact: true })).toHaveValue('First author');
  await page.getByLabel('Drawn by', { exact: true }).fill('Second author');
  await page.getByRole('button', { name: 'None', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export Sheet', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /^Sheet 1 A3/ }).click();
  await expect(page.getByLabel('Drawn by', { exact: true })).toHaveValue('First author');
  await expect(page.getByRole('button', { name: 'Export Sheet', exact: true })).toBeEnabled();
  await page.waitForTimeout(300);
  await page.reload();
  await page.getByRole('button', { name: 'Open Untitled', exact: true }).click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await drawings(page);
  await expect(page.getByLabel('Drawn by', { exact: true })).toHaveValue('First author');
  const items = page.getByRole('complementary', { name: 'Drawing items', exact: true });
  if (!(await items.isVisible())) await railButton(page, 'Items').click();
  await page.getByRole('button', { name: /^Sheet 2 A3/ }).click();
  await expect(page.getByLabel('Drawn by', { exact: true })).toHaveValue('Second author');
  await expect(page.getByRole('button', { name: 'Export Sheet', exact: true })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('drawing-sheets.png') });
});

test('a rectangle accepts length then Tab width without moving the pointer again', async ({
  page,
}) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
  await railButton(page, 'Rectangle').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await page.keyboard.type('47');
  await page.keyboard.press('Tab');
  await page.keyboard.type('23');
  await page.keyboard.press('Enter');
  const values = page.locator('.sketch-dimension input');
  await expect(values).toHaveCount(2);
  await expect
    .poll(async () =>
      (
        await values.evaluateAll((nodes) => nodes.map((n) => Number((n as HTMLInputElement).value)))
      ).sort((a, b) => a - b),
    )
    .toEqual([23, 47]);
  await values.first().click();
  await page.keyboard.type('31');
  await page.keyboard.press('Enter');
  await expect(values.first()).toHaveValue('31');
});

test('repositioning the blue extrude grip moves only the handle, not the body', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  const { pickAt } = await import('../app.js');
  await pickAt(page, { x: 20, y: 10, z: 15 });
  const origin = page.getByRole('button', { name: 'Reposition extrude handle', exact: true });
  const box = await origin.boundingBox();
  if (!box) throw new Error('Missing extrude grip');
  const canvas = page.locator('canvas.viewport');
  const before = await canvas.getAttribute('data-triangles');
  const input = page.getByRole('textbox', { name: 'Extrude distance', exact: true });
  const distance = await input.inputValue();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 15, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const after = await origin.boundingBox();
      return Math.abs((after?.x ?? box.x) - box.x);
    })
    .toBeGreaterThan(30);
  await expect(input).toHaveValue(distance);
  await expect(canvas).toHaveAttribute('data-triangles', before ?? '');
});

test('the drawing desk follows the theme and its dot grid stays fixed while paper moves', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openApp(page);
  await addBox(page);
  await drawings(page);
  const desk = page.locator('.dwg');
  expect(
    await desk.evaluate((el) => getComputedStyle(el).getPropertyValue('--canvas-bottom').trim()),
  ).toBe('#e0e0e0');
  const rail = page.getByRole('navigation', { name: 'Drawing items controls' });
  await expect(rail.getByRole('button', { name: 'Items', exact: true })).toHaveClass('rail__icon');
  const overview = await page.locator('.dwg-overview').boundingBox();
  expect(overview?.y).toBeLessThan(200);
  expect(overview?.x).toBeGreaterThan(700);
  // The dot grid belongs to the desk: dragging the desk moves its phase by the same amount (modulo
  // the pitch), and it settles on the desk once the drag stops.
  const dots = page.locator('canvas.dwg-dots');
  await expect(dots).toHaveAttribute('data-dots-x', /.+/);
  const phase = async () => Number(await dots.getAttribute('data-dots-x'));
  const before = await phase();
  const sheet = page.locator('.dwg__sheet');
  const initial = await sheet.boundingBox();
  if (!initial) throw new Error('Missing drawing sheet');
  await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
  await page.mouse.down();
  await page.mouse.move(initial.x + initial.width / 2 + 75, initial.y + initial.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await sheet.boundingBox())?.x ?? 0))
    .toBe(Math.round(initial.x + 75));
  await expect
    .poll(async () => {
      const pitch = Number(await dots.getAttribute('data-dots-pitch'));
      const off = ((((await phase()) - before - 75) % pitch) + pitch) % pitch;
      return Math.min(off, pitch - off) < 0.6;
    })
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath('drawings-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(
    await desk.evaluate((el) => getComputedStyle(el).getPropertyValue('--canvas-bottom').trim()),
  ).toBe('#1a1a1a');
  await page.screenshot({ path: test.info().outputPath('drawings-dark.png') });
});
