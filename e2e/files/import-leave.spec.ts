/**
 * Leaving a project while a model is still loading asks (through Nib) whether to continue in the
 * background or stop, and honours the answer. When the import finishes, Nib says so wherever the
 * user is, with a button that opens the project.
 */

import { loadOcct } from '../../packages/kernel/src/wasm.js';
import { openApp, openItems, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

/** A STEP file (many boxes, about 3 MB) large enough to be read in a dedicated worker. */
async function bigStep(): Promise<Buffer> {
  const occt = await loadOcct();
  const boxes = [];
  for (let i = 0; i < 700; i++) {
    boxes.push(occt.translate(occt.makeBox(5, 5, 5), (i % 28) * 8, Math.floor(i / 28) * 8, 0));
  }
  return Buffer.from(occt.exportStep(occt.makeCompound(boxes)));
}

async function startImport(page: import('@playwright/test').Page, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({ name: 'many-boxes.step', mimeType: 'application/step', buffer });
  await expect(
    page
      .getByRole('button', { name: /Importing many-boxes/ })
      .or(page.getByText(/Importing many-boxes/)),
  ).toBeVisible();
}

const question = (page: import('@playwright/test').Page) =>
  page.locator('.nib-island').getByRole('alertdialog');

test('leaving while a model loads: kept loading, it is in, and Nib opens it', async ({ page }) => {
  test.setTimeout(240_000);
  const buffer = await bigStep();
  expect(buffer.length).toBeGreaterThan(2_000_000);
  await openApp(page);
  await startImport(page, buffer);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(question(page)).toContainText('still loading');
  await question(page).getByRole('button', { name: 'Keep loading' }).click();
  await expect(page.locator('.library')).toBeVisible();
  // It lands in the project it started in, and Nib announces it on the start page.
  const open = page.locator('.nib-island').getByRole('button', { name: 'Open the project' });
  await expect(open).toBeVisible({ timeout: 200_000 });
  await open.click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0, { timeout: 100_000 });
  await openItems(page);
  await expect(page.locator('.body-row').first()).toBeVisible({ timeout: 30_000 });
});

test('leaving while a model loads: stopping it leaves no import behind', async ({ page }) => {
  test.setTimeout(240_000);
  const buffer = await bigStep();
  await openApp(page);
  await startImport(page, buffer);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await question(page).getByRole('button', { name: 'Stop loading' }).click();
  await expect(page.locator('.library')).toBeVisible();
  await expect(page.getByText(/Could not import many-boxes/)).toBeVisible({ timeout: 60_000 });
  // Nothing arrives afterwards.
  await page.waitForTimeout(8000);
  await expect(page.getByText('Imported many-boxes.step')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open the project' })).toHaveCount(0);
});
