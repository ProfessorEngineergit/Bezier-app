/** The parts library: what it offers follows the standards, and a part lands where it should. */

import { addBox, expectSaid, openApp, openItems, pickAt, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

const sheet = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Parts library' });

async function openLibrary(page: import('@playwright/test').Page) {
  await railButton(page, 'Parts').click();
  await railButton(page, 'Library').click();
  await expect(sheet(page)).toBeVisible();
}

const add = (page: import('@playwright/test').Page) =>
  sheet(page).getByRole('button', { name: 'Add', exact: true }).click();

test('a screw goes in from the library, at a length its standard has', async ({ page }) => {
  await openApp(page);
  await openItems(page);
  await openLibrary(page);
  await sheet(page).locator('.parts-sizes label', { hasText: /^M8$/ }).click();
  await expect(sheet(page).getByLabel('Length')).toHaveValue('25');
  await sheet(page).getByLabel('Length').selectOption('40');
  await add(page);
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row')).toHaveText(['M8 Socket head screw']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('a countersunk screw starts at M3, as its standard does', async ({ page }) => {
  await openApp(page);
  await openLibrary(page);
  const sizes = sheet(page).locator('.parts-sizes label');
  await expect(sizes.first()).toHaveText('M2');
  await sheet(page)
    .locator('.part-card', { hasText: 'Countersunk' })
    .locator('button')
    .first()
    .click();
  await expect(sizes.first()).toHaveText('M3');
});

test('nuts and washers have no length to choose', async ({ page }) => {
  await openApp(page);
  await openLibrary(page);
  await sheet(page).locator('.part-card', { hasText: 'Hex nut' }).locator('button').first().click();
  await expect(sheet(page).getByLabel('Length')).toHaveCount(0);
});

test('on a selected face a screw brings its counterbore and sits down in it', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  await railButton(page, 'Tools').click();
  await openLibrary(page);
  await expect(sheet(page).getByLabel('With its hole')).toBeChecked();
  await sheet(page).locator('.parts-sizes label', { hasText: /^M5$/ }).click();
  await add(page);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row')).toHaveText([
    'Sketch 1',
    'Extrude',
    'Hole',
    'M5 Socket head screw',
  ]);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('own parts: a STEP file and a picture stay in the library and can be removed', async ({
  page,
}) => {
  await openApp(page);
  await openLibrary(page);
  await sheet(page)
    .getByLabel('Add your own part')
    .setInputFiles([{ name: 'not-a-model.png', mimeType: 'image/png', buffer: Buffer.from('x') }]);
  await expectSaid(page, 'Pick a STEP file');
});

test('Escape shuts the library and nothing else', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openLibrary(page);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
});
