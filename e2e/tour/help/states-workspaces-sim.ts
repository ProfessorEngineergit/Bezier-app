/**
 * Pictures for the Simulation articles. They share one part, an angle bracket: a flat Γ with a
 * short arm bolted down and a long arm loaded, as in the first article's worked example.
 */

import type { Locator, Page } from '@playwright/test';
import { canvasRect, commitExtrude, openApp, railButton, screenPointOf } from '../../app.js';
import { expect, test } from '../../fixtures.js';
import type { State } from './frame.js';
import { toWorkspace } from './states-workspaces-world.js';
import { at, finish, sketching } from './world.js';

/**
 * The bracket's extent in millimetres. It is drawn on screen (the square top view is identical on
 * every run: 6.287 px per mm in a 2000 px wide picture), so its size is known to the millimetre and
 * its faces can be found again after reopening, with the camera back at the start pose that
 * `screenPointOf` reproduces.
 */
const BRACKET = { min: { x: -50.9, y: -23.9, z: 0 }, max: { x: 50.9, y: 39.8, z: 20 } };

/** Draws the bracket, extrudes it 20 mm, and reopens the project to reset the camera. */
async function makeBracket(page: Page): Promise<void> {
  await sketching(page);
  await page.keyboard.press('l');
  for (const [x, y] of [
    [0.34, 0.3],
    [0.66, 0.3],
    [0.66, 0.42],
    [0.46, 0.42],
    [0.46, 0.62],
    [0.34, 0.62],
    [0.34, 0.3],
  ] as const)
    await at(page, x, y);
  await page.keyboard.press('Escape');
  await finish(page);
  await railButton(page, 'Tools').click();
  await railButton(page, 'Extrude').click();
  await commitExtrude(page, '20');
  await openApp(page);
  await expect(page.locator('canvas.viewport')).toBeVisible();
}

/** Click points on each face a study uses: the short arm's foot and the long arm's top. */
async function faces(page: Page) {
  const rect = await canvasRect(page);
  const point = (x: number, y: number, z: number) => screenPointOf(rect, { x, y, z }, BRACKET);
  return {
    foot: point(-31.8, -23.9, 10),
    top: point(25, 28, 20),
    tip: point(50.9, 27.9, 10),
    corner: point(-16, 19, 20),
  };
}

async function simulating(page: Page): Promise<void> {
  await makeBracket(page);
  await toWorkspace(page, 'Simulation');
  await expect(page.getByRole('toolbar', { name: 'Study' })).toBeVisible();
}

/** A Fixed support on the short arm's foot; its panel stays open when `done` is false. */
async function fixFoot(page: Page, done = true): Promise<Locator> {
  const at = (await faces(page)).foot;
  await railButton(page, 'Fixed').click();
  await page.mouse.click(at.x, at.y);
  const panel = page.getByRole('complementary', { name: 'Fixed' });
  await expect(panel).toContainText('1 face');
  if (done) await panel.getByRole('button', { name: 'Done' }).click();
  return panel;
}

/** A load on top of the long arm. */
async function loadTop(
  page: Page,
  kind: 'Force' | 'Pressure',
  done = true,
  magnitude?: string,
): Promise<Locator> {
  const at = (await faces(page)).top;
  await railButton(page, kind).click();
  await page.mouse.click(at.x, at.y);
  const panel = page.getByRole('complementary', { name: kind });
  await expect(panel).toContainText('1 face');
  if (magnitude !== undefined) {
    const field = panel.getByLabel(kind === 'Force' ? 'Magnitude' : 'Pressure');
    await field.fill(magnitude);
    await field.press('Enter');
  }
  if (done) await panel.getByRole('button', { name: 'Done' }).click();
  return panel;
}

const FORCE = '200';

/** Fixed at the foot, pushed down on the long arm, tool dropped. */
async function setUp(page: Page): Promise<void> {
  await simulating(page);
  await fixFoot(page);
  await loadTop(page, 'Force', true, FORCE);
  // The force tool stays active after Done; drop it so no hint covers the picture.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status')).toHaveCount(0);
}

async function solved(page: Page): Promise<void> {
  test.setTimeout(400_000);
  await setUp(page);
  await page.locator('.sim-solve').click();
  await expect(page.locator('.sim-legend')).toBeVisible({ timeout: 180_000 });
}

export const SIMULATION: Record<string, State> = {
  'simulation-bar': async (page) => {
    await simulating(page);
    const bar = page.getByRole('toolbar', { name: 'Study' });
    await expect(page.getByRole('list', { name: 'How a study goes' })).toBeVisible();
    return { points: [bar], whole: true };
  },
  'simulation-fixed': async (page) => {
    await simulating(page);
    const panel = await fixFoot(page, false);
    return { points: [panel], whole: true };
  },
  'simulation-force': async (page) => {
    await simulating(page);
    await fixFoot(page);
    const panel = await loadTop(page, 'Force', false, FORCE);
    await expect(panel.getByLabel('Magnitude')).toHaveValue(FORCE);
    return { points: [panel.getByLabel('Magnitude')], whole: true };
  },
  'simulation-solved': async (page) => {
    await solved(page);
    return { points: [page.locator('.sim-legend__summary').first()], whole: true };
  },
  'simulation-supports-panel': async (page) => {
    await simulating(page);
    const panel = await fixFoot(page, false);
    return {
      points: [panel],
      area: [panel, railButton(page, 'Fixed'), railButton(page, 'Frictionless')],
    };
  },
  'simulation-supports-pin': async (page) => {
    await simulating(page);
    const foot = (await faces(page)).foot;
    await railButton(page, 'Pin').click();
    await page.mouse.click(foot.x, foot.y);
    const panel = page.getByRole('complementary', { name: 'Pin' });
    await expect(panel).toContainText('1 face');
    // Held in X and Y, free in Z: like a pin on a vertical shaft.
    const z = panel.getByRole('button', { name: 'Z', exact: true });
    await z.click();
    await expect(z).toHaveAttribute('aria-pressed', 'false');
    return { points: [z], area: [panel, railButton(page, 'Pin')] };
  },
  'simulation-loads-force': async (page) => {
    await simulating(page);
    await fixFoot(page);
    const panel = await loadTop(page, 'Force', false, FORCE);
    const direction = panel.getByText('Direction', { exact: true });
    return {
      points: [direction],
      area: [panel, page.locator('.sim-glyphs g[data-kind="force"]'), railButton(page, 'Force')],
    };
  },
  'simulation-loads-pressure': async (page) => {
    await simulating(page);
    await fixFoot(page);
    const panel = await loadTop(page, 'Pressure', false);
    return {
      points: [panel.getByLabel('Pressure')],
      area: [
        panel,
        page.locator('.sim-glyphs g[data-kind="pressure"]'),
        railButton(page, 'Pressure'),
      ],
    };
  },
  'simulation-loads-gravity': async (page) => {
    await simulating(page);
    await railButton(page, 'Gravity').click();
    await railButton(page, 'Gravity').hover();
    await expect(page.getByText('On', { exact: true })).toBeVisible();
    return {
      points: [railButton(page, 'Gravity')],
      area: [railButton(page, 'Gravity'), railButton(page, 'Force'), railButton(page, 'Fixed')],
    };
  },
  'simulation-browser-browser': async (page) => {
    await simulating(page);
    await fixFoot(page);
    await loadTop(page, 'Force', true, FORCE);
    await page.keyboard.press('Escape');
    await railButton(page, 'Study').click();
    const browser = page.getByRole('complementary', { name: 'Study browser' });
    await expect(browser).toContainText('200 N');
    return { points: [browser], whole: true };
  },
  'simulation-material-bar': async (page) => {
    await simulating(page);
    const material = page.locator('label.sim-select[title="Material"]');
    const mesh = page.locator('label.sim-select[title="Mesh density"]');
    return { points: [material, mesh], area: [page.getByRole('toolbar', { name: 'Study' })] };
  },
  'simulation-results-bar': async (page) => {
    await solved(page);
    const bar = page.getByRole('toolbar', { name: 'Results' });
    await expect(bar).toBeVisible();
    return { points: [bar], area: [bar, page.locator('.sim-legend')] };
  },
  'simulation-results-legend': async (page) => {
    await solved(page);
    const summary = page.locator('.sim-legend__summary').first();
    return { points: [summary], area: [page.locator('.sim-legend')] };
  },
  'simulation-results-hover': async (page) => {
    await solved(page);
    const corner = (await faces(page)).corner;
    await page.mouse.move(corner.x, corner.y);
    await expect(page.locator('.sim-legend__marker')).toHaveAttribute('data-active', 'true');
    return { points: [page.getByLabel('Result at cursor')], whole: true };
  },
  'simulation-optimisation-bar': async (page) => {
    await simulating(page);
    await page
      .locator('label.sim-select[title="Study type"] select')
      .selectOption('shape-optimisation');
    const keep = page.locator('.sim-range');
    await expect(keep).toBeVisible();
    return { points: [keep], area: [page.getByRole('toolbar', { name: 'Study' })] };
  },
  'simulation-optimisation-result': async (page) => {
    test.setTimeout(500_000);
    await setUp(page);
    await page
      .locator('label.sim-select[title="Study type"] select')
      .selectOption('shape-optimisation');
    await page.locator('.sim-solve').click();
    await expect(page.locator('.sim-legend')).toContainText('Material kept', { timeout: 300_000 });
    return { points: [page.locator('.sim-legend')], whole: true };
  },
};
