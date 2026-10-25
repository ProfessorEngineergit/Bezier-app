/** Export: the offered formats, a 3MF that is a valid zip, and exporting only the picked body. */

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { addBox, openApp, openItems, selectionCount } from '../app.js';
import { expect, test } from '../fixtures.js';

async function exportAs(page: Page, label: string): Promise<Buffer> {
  await page.locator('.titlebar__export').click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
  const file = await (await download).path();
  return readFileSync(file);
}

const stlTriangles = (bytes: Buffer) => bytes.readUInt32LE(80);

test('3MF comes out as a zip holding the model', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const bytes = await exportAs(page, '3MF');
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.toString('latin1')).toContain('unit="millimeter"');
});

test('only the picked body is exported when asked', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await page.locator('.body-row', { hasText: 'Body 1' }).click();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(page.locator('.body-row')).toHaveCount(2);

  // Escape steps back one level at a time: first the Tools flyout, then the selection. With nothing
  // picked, everything is exported.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(() => selectionCount(page)).toBe(0);
  const all = await exportAs(page, 'STL');
  await page.locator('.body-row', { hasText: 'Body 2' }).click();
  await page.locator('.titlebar__export').click();
  await expect(page.getByText('Only the selected body')).toBeVisible();
  await page.keyboard.press('Escape');
  const one = await exportAs(page, 'STL');
  expect(stlTriangles(one) * 2).toBe(stlTriangles(all));
});

test('the mesh fineness for STL and 3MF shows which is chosen', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await page.locator('.titlebar__export').click();
  const group = page.getByRole('group', { name: 'Mesh quality for STL and 3MF' });
  await expect(page.locator('.menu__segmentsLabel')).toHaveText('Mesh for STL and 3MF');
  const fine = group.getByRole('button', { name: 'Fine' });
  const coarse = group.getByRole('button', { name: 'Coarse' });
  await fine.click();
  await expect(fine).toHaveAttribute('aria-pressed', 'true');
  const background = (button: typeof fine) =>
    button.evaluate((element) => getComputedStyle(element).backgroundColor);
  // The chosen option looks different from an unchosen one.
  expect(await background(fine)).not.toBe(await background(coarse));
});
