/** Gear, Spring and Pipe from the rail: built, changed in the inspector, and undone. */

import { addBox, canvasRect, expectSaid, openApp, openItems, pickAt, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

async function tool(page: import('@playwright/test').Page, name: string) {
  await railButton(page, 'Parts').click();
  await railButton(page, name).click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await railButton(page, 'Parts').click();
}

test('a gear builds from the rail and its teeth change in the inspector', async ({ page }) => {
  await openApp(page);
  await openItems(page);
  await tool(page, 'Gear');
  await expect(page.locator('.items-row')).toHaveText(['Gear']);
  const teeth = page.getByRole('textbox', { name: 'Teeth' });
  await teeth.fill('32');
  await teeth.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('a spring builds from the rail, and coils that collide are refused, with Nib saying why', async ({
  page,
}) => {
  await openApp(page);
  await openItems(page);
  await tool(page, 'Spring');
  await expect(page.locator('.items-row')).toHaveText(['Spring']);
  const wire = page.getByRole('textbox', { name: 'Wire diameter' });
  await wire.fill('9');
  await wire.press('Enter');
  await expectSaid(page, 'run into each other');
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await wire.blur();
  await expect(wire).toHaveValue('2');
});

test('a pipe asks for a path, then follows it', async ({ page }) => {
  await openApp(page);
  await openItems(page);
  await tool(page, 'Pipe');
  await page.waitForTimeout(200);
  const rect = await canvasRect(page);
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  await page.keyboard.press('l');
  await page.mouse.click(rect.x + rect.width * 0.3, rect.y + rect.height * 0.6);
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.6);
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.3);
  await page.keyboard.press('Escape');
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await tool(page, 'Pipe');
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Pipe']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('the tool bar stays one strip, with what is rare behind More', async ({ page }) => {
  await openApp(page);
  await openItems(page);
  await tool(page, 'Gear');
  const bar = page.locator('.inspector');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  expect(box?.height).toBeLessThan(60);
  await expect(page.getByRole('combobox', { name: 'Plane' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More settings' }).click();
  await expect(page.getByRole('combobox', { name: 'Plane' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Result' })).toContainText('New body');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Plane' })).toHaveCount(0);
  // Escape shut the sheet, not the tool.
  await expect(bar).toBeVisible();
});

test("dragging a number's picture changes it", async ({ page }) => {
  await openApp(page);
  await openItems(page);
  await tool(page, 'Gear');
  const teeth = page.getByRole('textbox', { name: 'Teeth' });
  const handle = await page.locator('.param__icon--drag').first().boundingBox();
  if (handle === null) throw new Error('no handle');
  await page.mouse.move(handle.x + 10, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + 34, handle.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect(teeth).toHaveValue('24');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
});

for (const [name, cell] of [
  ['Box', 'Width'],
  ['Cylinder', 'Radius'],
  ['Sphere', 'Radius'],
  ['Cone', 'Top radius'],
  ['Torus', 'Tube radius'],
] as const) {
  test(`${name} builds from the rail and opens its sizes`, async ({ page }) => {
    await openApp(page);
    await openItems(page);
    await tool(page, name);
    await expect(page.locator('.items-row')).toHaveText([name]);
    await expect(page.getByRole('textbox', { name: cell })).toBeVisible();
    await expect(page.locator('.items-row__problem')).toHaveCount(0);
  });
}

test('a snap fit and a fit test build from the rail', async ({ page }) => {
  await openApp(page);
  await openItems(page);
  await tool(page, 'Snap fit');
  await tool(page, 'Fit test');
  await expect(page.locator('.items-row')).toHaveText(['Snap fit', 'Fit test']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('a boss stands on the clicked face', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  await railButton(page, 'Boss').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Boss']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  const height = page.getByRole('textbox', { name: 'Height' });
  await height.fill('18');
  await height.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('a draft tilts the picked wall', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await pickAt(page, { x: 40, y: 10, z: 7.5 });
  await railButton(page, 'Draft').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Draft']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('without its face a tool says what to click', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Lip').click();
  await expectSaid(page, 'Click the rim of a hollow part first');
});
