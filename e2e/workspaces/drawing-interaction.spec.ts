/** Drawings editing is exercised on the real B-Rep projection, not a mocked SVG. */
import type { Locator, Page } from '@playwright/test';
import { addBox, canvasRect, openApp, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

async function drawings(page: Page) {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
  await expect(page.getByRole('button', { name: 'Export Sheet', exact: true })).toBeEnabled();
}
async function endpoints(page: Page, view: string) {
  return page
    .locator(`[data-view="${view}"] polyline`)
    .first()
    .evaluate((line: SVGPolylineElement) => {
      const matrix = line.ownerSVGElement?.getScreenCTM();
      if (!matrix) throw new Error('Missing drawing matrix');
      const points = (line.getAttribute('points') ?? '').split(/\s+/).map(Number);
      const a = new DOMPoint(points[0], points[1]).matrixTransform(matrix);
      const b = new DOMPoint(points[points.length - 2], points[points.length - 1]).matrixTransform(
        matrix,
      );
      return [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ];
    });
}
// Playwright's WebKit bounds for SVG text can miss the real hit target, so compute them from the
// text bounds and screen matrix the browser draws with, including paper zoom.
async function textBox(label: Locator) {
  return label.evaluate((el: SVGGraphicsElement) => {
    const b = el.getBBox(),
      m = el.getScreenCTM();
    if (!m) throw new Error('No text transform');
    const points = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    const x = Math.min(...points.map((p) => p.x)),
      y = Math.min(...points.map((p) => p.y));
    return {
      x,
      y,
      width: Math.max(...points.map((p) => p.x)) - x,
      height: Math.max(...points.map((p) => p.y)) - y,
    };
  });
}
test('dimensions can be typed on paper, dragged, deleted, exported and restored', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await drawings(page);
  await page.getByRole('button', { name: 'Dimension', exact: true }).click();
  const [a, b] = await endpoints(page, 'front');
  if (!a || !b) throw new Error('Missing front edge');
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  const dimension = page.locator('.dwg-dimension');
  await expect(dimension).toHaveCount(1);
  const label = page.getByRole('button', { name: 'Edit Dimension 1 text', exact: true });
  const initialLabel = await textBox(label);
  await page.mouse.dblclick(
    initialLabel.x + initialLabel.width / 2,
    initialLabel.y + initialLabel.height / 2,
  );
  const text = page.getByRole('textbox', { name: 'Dimension 1 text', exact: true });
  await expect(text).toBeVisible();
  await text.fill('40 ±0.1');
  await text.press('Enter');
  await expect(label).toHaveText('40 ±0.1');
  const before = await textBox(label);
  if (!before) throw new Error('No dimension label');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 18, before.y + before.height / 2 - 24, {
    steps: 8,
  });
  await page.mouse.up();
  await expect.poll(async () => (await textBox(label)).y).toBeLessThan(before.y - 15);
  // Direct title edits feed the same fields as the inspector.
  const title = await textBox(page.getByRole('button', { name: 'Edit TITLE', exact: true }));
  await page.mouse.dblclick(title.x + title.width / 2, title.y + title.height / 2);
  await page.getByRole('textbox', { name: 'TITLE', exact: true }).fill('Plate detail');
  await page.getByRole('textbox', { name: 'TITLE', exact: true }).press('Enter');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Plate detail');
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Sheet', exact: true }).click();
  await page.getByRole('menuitem', { name: /^DXF/ }).click();
  const download = await saved;
  await download.saveAs(test.info().outputPath('dimension.dxf'));
  const pdfSaved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Sheet', exact: true }).click();
  await page.getByRole('menuitem', { name: /^PDF/ }).click();
  await (await pdfSaved).saveAs(test.info().outputPath('dimension.pdf'));
  await page.screenshot({ path: test.info().outputPath('dimensions.png') });
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole('button', { name: 'Open Untitled', exact: true }).click();
  await drawings(page);
  await expect(page.locator('.dwg-dimension text')).toHaveText('40 ±0.1');
  await page.getByRole('button', { name: 'Move dimension 1', exact: true }).focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.dwg-dimension')).toHaveCount(0);
});
test('isometric measurements show real 3D lengths and top controls share one baseline', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await drawings(page);
  const toolbar = await page.locator('.dwg-toolbar').boundingBox(),
    overview = await page.locator('.dwg-overview').boundingBox(),
    inspector = await page.locator('.dwg-inspector').boundingBox();
  expect(toolbar?.y).toBe(inspector?.y);
  expect(overview?.y).toBe(inspector?.y);
  if (!toolbar || !overview) throw new Error('Missing top controls');
  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(overview.x);
  await page.getByRole('button', { name: 'Dimension', exact: true }).click();
  const toolY = await Promise.all(
    ['Dimension', 'Section', 'Detail'].map(
      async (name) => (await page.getByRole('button', { name, exact: true }).boundingBox())?.y,
    ),
  );
  expect(new Set(toolY).size).toBe(1);
  const [a, b] = await endpoints(page, 'isometric');
  if (!a || !b) throw new Error('Missing isometric edge');
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await expect(page.locator('.dwg-dimension')).toHaveCount(1);
  const value = Number(await page.locator('.dwg-dimension text').textContent());
  expect([15, 20, 40]).toContain(value);
  await page.getByRole('button', { name: 'Dimension', exact: true }).click();
  await page.getByRole('button', { name: 'Export Sheet', exact: true }).click();
  const pdf = await page.getByRole('menuitem', { name: /^PDF/ }).boundingBox(),
    dxf = await page.getByRole('menuitem', { name: /^DXF/ }).boundingBox();
  expect(pdf?.x).toBe(dxf?.x);
  expect(pdf?.width).toBe(dxf?.width);
  await page.screenshot({ path: test.info().outputPath('isometric-dimension.png') });
});
test('a visible New Sheet button starts a blank sheet with its own items and overview', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await drawings(page);
  await page.getByRole('button', { name: 'Add sheet', exact: true }).click();
  const items = page.getByRole('complementary', { name: 'Drawing items', exact: true });
  await expect(items).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Body 1', exact: true })).not.toBeChecked();
  await expect(page.locator('.dwg-overview [data-active] polyline')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export Sheet', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Sketch 1', exact: true }).first().check();
  await expect(page.locator('.dwg-overview [data-active] polyline')).not.toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Sheet 2 A3/ })).toContainText(
    '0 bodies · 1 sketches',
  );
  await expect(page.locator('.dwg__sheet[data-active] .drawing-paper')).toContainText('2 / 2');
  await page.getByRole('button', { name: /^Sheet 1 A3/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Body 1', exact: true })).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Sketch 1', exact: true }).first(),
  ).not.toBeChecked();
  await expect(page.locator('.dwg__sheet[data-active] .drawing-paper')).toContainText('1 / 2');
});
test('typing takes over a fillet drag and previews before confirmation', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const p = screenPointOf(await canvasRect(page), { x: 40, y: 10, z: 15 });
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.edge-gizmo__bar')).toBeVisible();
  await page.keyboard.type('1.5');
  const input = page.getByRole('textbox', { name: 'Fillet radius', exact: true });
  await expect(input).toHaveValue('1.5');
  await expect(page.locator('canvas.viewport[data-part-preview]')).toHaveCount(1);
  await input.press('Enter');
  await railButton(page, 'Items').click();
  await expect(page.locator('.items-row', { hasText: 'Fillet' })).toBeVisible();
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  const grip = page.getByRole('button', { name: 'Drag to size', exact: true });
  const bounds = await grip.boundingBox();
  if (!bounds) throw new Error('No fillet grip');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 5, bounds.y + bounds.height / 2 + 5, {
    steps: 3,
  });
  await page.keyboard.type('2');
  await expect(input).toHaveValue('2');
  await page.mouse.up();
  await input.press('Enter');
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('Drawing Items resize with the shared handle and retain the width across workspaces', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await drawings(page);
  await railButton(page, 'Items').click();
  const panel = page.getByRole('complementary', { name: 'Drawing items', exact: true });
  // Wait for the panel to finish sliding in; a grip position read mid-animation is stale by the
  // time the pointer gets there.
  await page.waitForTimeout(700);
  const before = (await panel.boundingBox())?.width ?? 0;
  const handle = page.getByRole('separator', { name: 'Resize drawing items panel' });
  const grip = await handle.boundingBox();
  if (!grip) throw new Error('No resize grip');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 80);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 55, grip.y + 80, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before + 45);
  const after = (await panel.boundingBox())?.width;
  const rail = await page.getByRole('navigation', { name: 'Drawing items controls' }).boundingBox();
  const panelBounds = await panel.boundingBox();
  if (!rail || !panelBounds) throw new Error('Missing panel bounds');
  expect(rail.x).toBeGreaterThan(panelBounds.x + panelBounds.width);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Modeling/ }).click();
  await expect
    .poll(
      async () =>
        (await page.getByRole('complementary', { name: 'Items', exact: true }).boundingBox())
          ?.width ?? 0,
    )
    // To the pixel: a panel that just arrived can be a fraction off, and a mid-animation width
    // differs slightly from the settled one.
    .toBeCloseTo(after ?? 0, 0);
  await drawings(page);
  await handle.dblclick();
  await expect.poll(async () => (await panel.boundingBox())?.width ?? 0).toBeCloseTo(before, 0);
});

test('a section and a detail are marked on the views they come from (audit F-020)', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await drawings(page);
  await page.getByRole('button', { name: 'Section', exact: true }).click();
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  const sheet = page.locator('.dwg__sheet[data-active] .drawing-paper');
  await expect(sheet.locator('[data-view="section"]')).toHaveCount(1);
  const cut = sheet.getByLabel('Section A–A cutting plane');
  await expect(cut.locator('text')).toHaveText(['A', 'A']);
  await expect(sheet.getByLabel('Detail B outline').locator('text')).toHaveText('B');
  // The cutting line crosses the front view within its height.
  const front = await sheet.locator('[data-view="front"]').boundingBox();
  const line = await cut.locator('line').first().boundingBox();
  if (front === null || line === null) throw new Error('missing front view or cutting line');
  expect(line.y).toBeGreaterThan(front.y);
  expect(line.y).toBeLessThan(front.y + front.height);
  expect(line.width).toBeGreaterThan(front.width * 0.8);
  await page.screenshot({ path: test.info().outputPath('section-detail-callouts.png') });
});
