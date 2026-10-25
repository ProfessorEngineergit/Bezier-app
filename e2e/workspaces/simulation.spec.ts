/**
 * The Simulation workspace end to end: switch to it, fix the part, load it, solve and read stress,
 * on the real kernel with the solver in its worker. The starter box is 40 × 20 × 15 mm and the
 * camera looks from +X, −Y, +Z, so the +X end, the −Y front and the top are clickable.
 */

import { statSync } from 'node:fs';
import { addBox, canvasRect, openApp, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

test('a box fixed at one end and pushed on its face solves and shows stress on the part', async ({
  page,
}) => {
  // The solve itself is allowed 90 s below; the test needs more.
  test.setTimeout(180_000);
  await openApp(page);
  await addBox(page);

  await page.getByRole('button', { name: 'Workspace: Modeling' }).click();
  await page.getByRole('menuitemradio', { name: /Simulation/ }).click();
  // Study settings and Solve stay in the top bar; missing inputs and results are in a right-hand
  // panel, as in Visualize and Drawings, and the rail marks what is needed.
  await expect(page.getByRole('toolbar', { name: 'Study' })).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Study', exact: true });
  await expect(panel).toBeVisible();
  // Plain-language explanations of what a support and a load are.
  await expect(panel.getByRole('status')).toContainText('Still needed');
  await expect(panel.getByRole('status')).toContainText('A support: the face the part is held by');
  await expect(panel.getByRole('status')).toContainText('A load: what pushes or pulls');
  // The tools that place them show their labels while needed, not only on hover.
  await expect(page.locator('.rail__group[data-needed] .rail__labels').first()).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(page.locator('.rail__group[data-needed]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Workspace: Simulation' })).toBeVisible();

  // Solve pressed too early says what is missing instead of doing nothing.
  const solve = page.locator('.sim-solve');
  await expect(solve).toBeEnabled();
  await solve.click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Add a support');
  await expect(alert).toContainText('Add a load');
  await alert.getByRole('button', { name: 'Dismiss', exact: true }).click();

  const rect = await canvasRect(page);
  const endFace = screenPointOf(rect, { x: 40, y: 10, z: 7.5 });
  const frontFace = screenPointOf(rect, { x: 12, y: 0, z: 7.5 });

  await railButton(page, 'Fixed').click();
  await page.mouse.click(endFace.x, endFace.y);
  const fixed = panel.getByRole('region', { name: 'Fixed' });
  await expect(fixed).toContainText('1 face');
  // A support with nothing to set has no Done button: Esc or a click beside the part ends it.
  await expect(fixed.getByRole('button', { name: 'Done' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(fixed).toHaveCount(0);
  await expect(page.locator('.rail__group[data-needed]')).toHaveCount(1);

  await railButton(page, 'Force').click();
  await page.mouse.click(frontFace.x, frontFace.y);
  const force = panel.getByRole('region', { name: 'Force' });
  await expect(force).toContainText('1 face');
  await force.getByRole('button', { name: 'Done' }).click();

  // The study browser stays closed until requested, so it never covers the faces being clicked;
  // opened, it lists both placements.
  await expect(page.getByRole('complementary', { name: 'Study browser' })).toHaveCount(0);
  await railButton(page, 'Study').click();
  const browser = page.getByRole('complementary', { name: 'Study browser' });
  await expect(browser).toContainText('Fixed');
  await expect(browser).toContainText('100 N');

  await solve.click();
  const legend = page.locator('.sim-legend');
  await expect(legend).toBeVisible({ timeout: 90_000 });
  await expect(legend).toContainText('Von Mises Stress');
  // A one-sentence explanation of the result, and the outcome for the part.
  await expect(panel.getByText('How hard the material is working at each point')).toBeVisible();
  await expect(panel.locator('.sim-verdict')).toContainText('It holds');
  const peak = await panel.locator('dt:text("Max stress") + dd').textContent();
  expect(Number.parseFloat(peak ?? '0')).toBeGreaterThan(0);
  await page.mouse.move(frontFace.x, frontFace.y);
  const marker = page.locator('.sim-legend__marker');
  await expect(marker).toHaveAttribute('data-active', 'true');
  await expect(page.getByLabel('Result at cursor')).toContainText('MPa');
  const firstValue = await marker.getAttribute('data-value');
  await page.mouse.move(endFace.x, endFace.y);
  await expect(marker).toHaveAttribute('data-active', 'true');
  await expect.poll(() => marker.getAttribute('data-value')).not.toBe(firstValue);
  expect(await marker.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('top');
  await page.mouse.move(rect.x + 5, rect.y + 5);
  await expect(marker).toHaveAttribute('data-active', 'false');
  await page.screenshot({ path: test.info().outputPath('stress.png') });

  await panel
    .getByRole('region', { name: 'Results' })
    .getByRole('button', { name: 'Displacement' })
    .click();
  await expect(legend).toContainText('Displacement');

  // The values export as a table, one row per model point.
  const values = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Values (CSV)' }).click();
  const table = await (await values).path();
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(table, 'utf8');
  expect(text).toContain('von_mises_MPa');
  expect(text.split('\n').length).toBeGreaterThan(20);

  // A physics drawing goes to Drawings as its own kind of sheet, to arrange and export.
  await panel.getByRole('button', { name: 'Create physics drawing' }).click();
  await expect(page.getByRole('button', { name: 'Workspace: Drawings' })).toBeVisible({
    timeout: 20_000,
  });
  const kind = page.getByRole('group', { name: 'Kind of drawing' });
  await expect(kind.getByRole('button', { name: /Physics/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A sheet in the same drawing book, desk and frame as every drawing sheet.
  const paper = page.locator('.dwg__sheet[data-active] .drawing-paper');
  await expect(paper.locator('image')).toHaveCount(4);
  const inspector = page.getByRole('complementary', { name: 'Sheet', exact: true });
  await inspector.getByRole('switch', { name: 'Top' }).uncheck();
  await expect(paper.locator('image')).toHaveCount(3);
  await inspector.getByLabel('Title', { exact: true }).fill('Bracket under 100 N');
  await expect(paper).toContainText('Bracket under 100 N');
  // Exported like every sheet.
  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Sheet' }).click();
  await page.getByRole('menuitem', { name: /PDF/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
  // Images are embedded as print-size JPEG, not raw pixels with masks, to keep the PDF small
  // (audit F-024).
  const saved = await (await pdf).path();
  expect(statSync(saved).size).toBeLessThan(3_000_000);
  // The same toggle returns to the drawing sheets.
  await kind.getByRole('button', { name: 'Drawings' }).click();
  await expect(page.locator('.dwg__sheet [data-physics]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Workspace: Drawings' }).click();
  await page.getByRole('menuitemradio', { name: /^Simulation/ }).click();

  // Back in Modeling, the model shows without simulation overlays.
  await page.getByRole('button', { name: 'Workspace: Simulation' }).click();
  await page.getByRole('menuitemradio', { name: /^Modeling/ }).click();
  await expect(page.locator('.sim-legend')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Study', exact: true })).toHaveCount(0);
});

test('Simulation replaces the open modeling Items panel with its Study browser', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Items').click();
  await expect(page.locator('.items-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Workspace: Modeling' }).click();
  await page.getByRole('menuitemradio', { name: /Simulation/ }).click();
  await expect(page.locator('.items-panel')).toHaveCount(0);
  await railButton(page, 'Study').click();
  // The study browser is the shared Items panel, holding the study instead of the model.
  await expect(page.getByRole('complementary', { name: 'Study browser' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Items', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Workspace: Simulation' }).click();
  await page.getByRole('menuitemradio', { name: /^Modeling/ }).click();
  await expect(page.locator('.items-panel')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Study browser' })).toHaveCount(0);
});

test('a thermal study: a heated end and a held end solve to a temperature the panel reads out', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: 'Workspace: Modeling' }).click();
  await page.getByRole('menuitemradio', { name: /Simulation/ }).click();
  const panel = page.getByRole('complementary', { name: 'Study', exact: true });
  await page
    .getByRole('toolbar', { name: 'Study' })
    .locator('select')
    .first()
    .selectOption('thermal');
  await expect(railButton(page, 'Heat')).toBeVisible();
  await expect(railButton(page, 'Force')).toHaveCount(0);

  const rect = await canvasRect(page);
  const endFace = screenPointOf(rect, { x: 40, y: 10, z: 7.5 });
  const frontFace = screenPointOf(rect, { x: 12, y: 0, z: 7.5 });
  await railButton(page, 'Temperature').click();
  await page.mouse.click(endFace.x, endFace.y);
  await panel
    .getByRole('region', { name: 'Temperature' })
    .getByRole('button', { name: 'Done' })
    .click();
  await railButton(page, 'Heat').click();
  await page.mouse.click(frontFace.x, frontFace.y);
  await panel.getByRole('region', { name: 'Heat' }).getByRole('button', { name: 'Done' }).click();
  await page.locator('.sim-solve').click();

  const legend = panel.locator('.sim-legend');
  await expect(legend).toContainText('Temperature', { timeout: 90_000 });
  const highest = await panel.locator('dt:text("Highest temperature") + dd').textContent();
  // 5 W into PLA held at 20 °C at the other end: well above 20.
  expect(Number.parseFloat(highest ?? '0')).toBeGreaterThan(20);
  await page.screenshot({ path: test.info().outputPath('thermal.png') });
});

test('a double-click heats the whole body, not only the face under the pointer', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: 'Workspace: Modeling' }).click();
  await page.getByRole('menuitemradio', { name: /Simulation/ }).click();
  const panel = page.getByRole('complementary', { name: 'Study', exact: true });
  await page
    .getByRole('toolbar', { name: 'Study' })
    .locator('select')
    .first()
    .selectOption('thermal');
  const rect = await canvasRect(page);
  const frontFace = screenPointOf(rect, { x: 12, y: 0, z: 7.5 });
  await railButton(page, 'Heat').click();
  await page.mouse.dblclick(frontFace.x, frontFace.y);
  // The starter box has six faces, all of which take the heat.
  await expect(panel.getByRole('region', { name: 'Heat' })).toContainText('6 faces');
});
