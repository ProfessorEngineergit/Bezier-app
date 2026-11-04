/** The workspaces against real rendering, HLR and persistent project storage. */
import { addBox, canvasRect, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

async function mode(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
}
test('modeling workspaces and real drawing projection and vector exports', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  // Modeling, Simulation, Visualize and Drawings.
  await expect(page.getByRole('menuitemradio')).toHaveCount(4);
  await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
  await expect(page.getByRole('button', { name: 'Export Sheet', exact: true })).toBeEnabled();
  await expect(page.locator('.drawing-paper polyline')).not.toHaveCount(0);
  await page.getByLabel('Drawn by', { exact: true }).fill('ASTRA');
  const pdfPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Sheet', exact: true }).click();
  await page.getByRole('menuitem', { name: /^PDF/ }).click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toBe('DWG-001.pdf');
  await pdf.saveAs(test.info().outputPath('astra-drawing.pdf'));
  const dxfPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Sheet', exact: true }).click();
  await page.getByRole('menuitem', { name: /^DXF/ }).click();
  const dxf = await dxfPromise;
  await dxf.saveAs(test.info().outputPath('astra-drawing.dxf'));
  await page.screenshot({ path: test.info().outputPath('astra-drawings-workspace.png') });
  await mode(page, 'Drawings');
  await expect(page.getByLabel('Drawn by', { exact: true })).toHaveValue('ASTRA');
});
test('PBR materials, optical controls and screenshot export', async ({ page }) => {
  // Filtering three environment maps, then materials with three textures each; every change
  // compiles a heavy shader. In software rendering this takes 58 s on ten cores and over 4 minutes
  // on a two-core CI runner, with the page unresponsive meanwhile.
  test.setTimeout(process.env.CI ? 600_000 : 240_000);
  await openApp(page);
  await addBox(page);
  const neutralHdri = page.waitForResponse((response) =>
    response.url().endsWith('/environments/studio-neutral.hdr'),
  );
  await mode(page, 'Visualize');
  await expect(page.getByLabel('PBR presentation viewport')).toBeVisible();
  const neutralResponse = await neutralHdri;
  expect(neutralResponse.ok()).toBe(true);
  expect((await neutralResponse.body()).subarray(0, 10).toString()).toContain('#?RADIANCE');
  await page.getByRole('tab', { name: 'Environment', exact: true }).click();
  const warmHdri = page.waitForResponse((response) =>
    response.url().endsWith('/environments/studio-warm.hdr'),
  );
  await page.getByRole('button', { name: 'Warm Studio', exact: true }).click();
  const hdriResponse = await warmHdri;
  expect(hdriResponse.ok()).toBe(true);
  expect((await hdriResponse.body()).subarray(0, 10).toString()).toContain('#?RADIANCE');
  await expect(page.getByRole('button', { name: 'Warm Studio', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const technicalHdri = page.waitForResponse((response) =>
    response.url().endsWith('/environments/studio-cool.hdr'),
  );
  await page.getByRole('button', { name: 'Technical Studio', exact: true }).click();
  const technicalResponse = await technicalHdri;
  expect(technicalResponse.ok()).toBe(true);
  expect((await technicalResponse.body()).subarray(0, 10).toString()).toContain('#?RADIANCE');
  await expect(page.locator('.viz-environments')).toHaveAttribute('aria-busy', 'false');
  // Returning to a loaded preset hits the PMREM cache: no second request.
  await page.getByRole('button', { name: 'Warm Studio', exact: true }).click();
  await page.getByRole('tab', { name: 'Material', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ABS', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'White ABS', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use #c83c35', exact: true }).click();
  await expect(page.getByLabel('Material hex colour', { exact: true })).toHaveValue('#C83C35');
  await expect(page.getByText('Grain', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PLA', exact: true }).click();
  await expect(page.getByText('Matte · print layers · Plastic', { exact: true })).toBeVisible();
  await page.getByLabel('Material hex colour', { exact: true }).scrollIntoViewIfNeeded();
  await page.getByLabel('Material hex colour', { exact: true }).fill('#416FAB');
  await expect(page.getByLabel('Material hex colour', { exact: true })).toHaveValue('#416FAB');
  await page.screenshot({ path: test.info().outputPath('bezier-material-picker.png') });
  const walnutMaps = Promise.all(
    ['albedo.jpg', 'normal.jpg', 'roughness.jpg'].map((file) =>
      page.waitForResponse((response) =>
        response.url().endsWith(`/materials/american_walnut_veneer/${file}`),
      ),
    ),
  );
  await page.getByRole('button', { name: 'American Walnut', exact: true }).click();
  for (const response of await walnutMaps) {
    expect(response.ok()).toBe(true);
    expect((await response.body()).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  }
  await expect(page.getByText('Loading maps…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Poly Haven · CC0', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Structure Scale', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('bezier-pbr-walnut.png') });
  await page.getByRole('button', { name: 'Copper', exact: true }).click();
  await page.getByRole('button', { name: 'Turntable', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Turntable', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop Turntable', exact: true }).click();
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  const download = await saved;
  await download.saveAs(test.info().outputPath('astra-pbr-render.png'));
  await page.screenshot({ path: test.info().outputPath('astra-visualize-workspace.png') });
});
test('the drawing inspector can be dragged wider, and the sheet keeps clear of it', async ({
  page,
}) => {
  await openApp(page);
  await mode(page, 'Drawings');

  const panel = page.locator('.dwg-inspector');
  const before = (await panel.boundingBox())?.width ?? 0;
  expect(before).toBeGreaterThan(0);

  // Its handle is on the left edge, so dragging left widens it: the mirror of the library sidebar,
  // using the same component.
  const handle = page.getByRole('separator', { name: 'Resize inspector' });
  const grip = await handle.boundingBox();
  if (grip === null) throw new Error('the inspector has no resize handle');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 120);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 - 80, grip.y + 120, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await panel.boundingBox())?.width).toBeGreaterThan(before);
  // The width is published because the toolbar and status line centre on the remaining space, not
  // the window.
  await expect
    .poll(() =>
      page
        .locator('.dwg')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--dwg-inspector').trim()),
    )
    .not.toBe('');

  await handle.dblclick();
  await expect.poll(async () => (await panel.boundingBox())?.width).toBe(before);
});

test('a new project opens in Modeling, wherever the last one was left', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
  await expect(page.getByRole('button', { name: 'Workspace: Drawings' })).toBeVisible();

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.getByRole('button', { name: 'Workspace: Modeling' })).toBeVisible();
});

test('a second project shows its own views in Drawings', async ({ page }) => {
  const toDrawings = async () => {
    await page.getByRole('button', { name: /Workspace:/ }).click();
    await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
  };
  await openApp(page);
  await addBox(page);
  await toDrawings();
  await expect(page.locator('.drawing-paper polyline')).not.toHaveCount(0);

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.getByRole('button', { name: 'Workspace: Modeling' })).toBeVisible();
  // Drawn and pulled by hand, as a person does, not the starter box.
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  await page.keyboard.press('r');
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await page.keyboard.press('Escape');
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  const field = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await field.fill('10');
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await toDrawings();
  await expect(page.locator('.drawing-paper polyline')).not.toHaveCount(0);
});
