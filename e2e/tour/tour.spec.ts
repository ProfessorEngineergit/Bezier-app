/**
 * The tour: screenshots of the app in a fixed set of states for the README and docs, so they can
 * be regenerated on every system instead of captured by hand. Not a behaviour test.
 *
 *   SHOTS_DIR=out SHOTS_OS=macos pnpm exec playwright test --project=tour
 *
 * Chromium everywhere (`TOUR_ENGINE=webkit` for WebKit); see the project in `playwright.config.ts`.
 * Native window chrome is captured separately from the real binary (docs/assets/README.md).
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { addBox, afterFrames, canvasRect, openItems, railButton, screenPointOf } from '../app.js';
import { expect, test } from '../fixtures.js';

const OUT = process.env.SHOTS_DIR ?? 'tour-out';
const OS = process.env.SHOTS_OS ?? 'local';
const SAMPLE = fileURLToPath(
  new URL('../fixtures-files/box-extrude.bezierlesson', import.meta.url),
);

/** The seam where the top face meets the +X side. */
const EDGE = { x: 40, y: 10, z: 15 };
const OTHER_EDGE = { x: 40, y: 0, z: 7.5 };

test.describe.configure({ mode: 'serial' });
// Without a GPU, the Visualize shaders take minutes.
test.setTimeout(process.env.CI ? 1_500_000 : 300_000);

mkdirSync(OUT, { recursive: true });

async function idle(page: Page): Promise<void> {
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await afterFrames(page);
  await afterFrames(page);
}

/** Takes a screenshot once the app is idle, two frames have passed and notices are gone. */
async function shot(page: Page, name: string): Promise<void> {
  await idle(page);
  await expect(page.locator('.toast'))
    .toHaveCount(0, { timeout: 12_000 })
    .catch(() => undefined);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${OS}-${name}.png`) });
}

async function mode(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
  await idle(page);
}

async function rename(page: Page, name: string): Promise<void> {
  await page.locator('.titlebar__name').click();
  const field = page.getByRole('textbox', { name: 'Project name' });
  await field.fill(name);
  await field.press('Enter');
  await expect(page.locator('.titlebar__name')).toHaveText(name);
}

/** Rounds (or bevels) the edge by typing the value, as a user would. */
async function roundEdge(
  page: Page,
  at: { x: number; y: number; z: number },
  value: string,
  kind: 'Fillet' | 'Chamfer' = 'Fillet',
): Promise<void> {
  if (process.env.TOUR_DEBUG) {
    console.log('roundEdge in', await page.locator('.titlebar__name').textContent(), kind, value);
  }
  const point = screenPointOf(await canvasRect(page), at);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.edge-gizmo__bar')).toBeVisible();
  if (kind === 'Chamfer') {
    await page.locator('.edge-gizmo__kind').click();
    await page.locator('.edge-gizmo__menu-item', { hasText: 'Chamfer' }).click();
  }
  await page.locator('.edge-gizmo__value').click();
  const field = page.locator('.edge-gizmo__value--input');
  await field.fill(value);
  await field.press('Enter');
  await idle(page);
  await page.keyboard.press('Escape');
}

/** Creates a library project: a box, modified by `build`, named, then left. */
async function makeProject(page: Page, name: string, build: () => Promise<void>): Promise<void> {
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await idle(page);
  await addBox(page);
  await build();
  await rename(page, name);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library')).toBeVisible();
  // The card thumbnail is taken on leaving, a moment later.
  await expect(page.locator('.tile__shot').first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.tile__shot')
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
}

test('the tour', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();

  // A library with something in it.
  await makeProject(page, 'Enclosure lid', () => roundEdge(page, EDGE, '3'));
  await makeProject(page, 'Bracket', () => roundEdge(page, EDGE, '2', 'Chamfer'));
  await makeProject(page, 'Housing', async () => {
    await roundEdge(page, EDGE, '4');
    await roundEdge(page, OTHER_EDGE, '2');
  });
  await makeProject(page, 'Spacer', async () => undefined);
  await shot(page, '01-start');

  // The editor on a part.
  await page.getByRole('button', { name: 'Open Housing' }).click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await idle(page);
  await shot(page, '02-editor');

  const point = screenPointOf(await canvasRect(page), EDGE);
  await page.mouse.click(point.x - 14, point.y + 6);
  await shot(page, '03-selection');
  await page.keyboard.press('Escape');

  await openItems(page);
  await shot(page, '04-history');

  // The same part, light and dark.
  await page.emulateMedia({ colorScheme: 'light' });
  await shot(page, '05-editor-light');
  await page.emulateMedia({ colorScheme: 'dark' });

  // Section view.
  await railButton(page, 'Section View').click();
  await shot(page, '06-section');
  await railButton(page, 'Section View').click();

  // Drawings.
  await mode(page, 'Drawings');
  await expect(page.locator('.drawing-paper polyline')).not.toHaveCount(0);
  await shot(page, '07-drawings');

  // Settings and lessons.
  await page.keyboard.press('ControlOrMeta+,');
  const preferences = page.getByRole('region', { name: 'Preferences' });
  await expect(preferences).toBeVisible();
  await preferences.getByRole('button', { name: 'Interaction', exact: true }).click();
  await shot(page, '10-settings');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Learn', exact: true })
    .click();
  await expect(page.locator('.lessons-home')).toBeVisible();
  await page.setInputFiles('.lessons-home input[type=file]', SAMPLE);
  await expect(page.locator('.lessons-player')).toBeVisible();
  await shot(page, '11-lesson');

  // Slow shots last: without a GPU Visualize takes minutes and the solve over two, and earlier
  // shots are kept if these do not finish.
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await page.getByRole('button', { name: 'Open Housing' }).click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await idle(page);
  await mode(page, 'Visualize');
  await expect(page.getByLabel('PBR presentation viewport')).toBeVisible();
  await page.getByRole('tab', { name: 'Environment', exact: true }).click();
  await page.getByRole('button', { name: 'Warm Studio', exact: true }).click();
  await page.getByRole('tab', { name: 'Material', exact: true }).click();
  await page.getByRole('button', { name: 'Copper', exact: true }).click();
  await page.waitForTimeout(2500);
  await shot(page, '08-visualize');

  // Simulation.
  await mode(page, 'Modeling');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Spacer' }).click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await idle(page);
  await mode(page, 'Simulation');
  const rect = await canvasRect(page);
  await railButton(page, 'Fixed').click();
  const endFace = screenPointOf(rect, { x: 40, y: 10, z: 7.5 });
  await page.mouse.click(endFace.x, endFace.y);
  await page
    .getByRole('complementary', { name: 'Fixed' })
    .getByRole('button', { name: 'Done' })
    .click();
  await railButton(page, 'Force').click();
  const frontFace = screenPointOf(rect, { x: 12, y: 0, z: 7.5 });
  await page.mouse.click(frontFace.x, frontFace.y);
  await page
    .getByRole('complementary', { name: 'Force' })
    .getByRole('button', { name: 'Done' })
    .click();
  await page.locator('.sim-solve').click();
  await expect(page.locator('.sim-legend')).toBeVisible({
    timeout: process.env.CI ? 900_000 : 120_000,
  });
  await shot(page, '09-simulation');
  await mode(page, 'Modeling');
});
