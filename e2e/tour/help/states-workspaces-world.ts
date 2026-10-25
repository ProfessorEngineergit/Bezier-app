/** Shared setup for the other workspaces' pictures: switching workspace and the starting model. */

import type { Locator, Page } from '@playwright/test';
import { addBox, canvasRect, railButton, screenPointOf } from '../../app.js';
import { expect } from '../../fixtures.js';

export type WorkspaceName = 'Modeling' | 'Simulation' | 'Visualize' | 'Drawings';

/** Switches workspace through the top bar menu, as a user does. */
export async function toWorkspace(page: Page, name: WorkspaceName): Promise<void> {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('button', { name: `Workspace: ${name}` })).toBeVisible();
}

/** The box, then the Simulation workspace. */
export async function simulating(page: Page): Promise<void> {
  await addBox(page);
  await toWorkspace(page, 'Simulation');
  await expect(page.getByRole('toolbar', { name: 'Study' })).toBeVisible();
}

/** Screen positions of the box's end, front and top faces, the ones a click can reach. */
export async function boxFaces(page: Page) {
  const rect = await canvasRect(page);
  return {
    end: screenPointOf(rect, { x: 40, y: 10, z: 7.5 }),
    front: screenPointOf(rect, { x: 12, y: 0, z: 7.5 }),
    top: screenPointOf(rect, { x: 20, y: 10, z: 15 }),
  };
}

/** A support on the end of the box. The panel stays open when `done` is false. */
export async function fixEnd(page: Page, done = true): Promise<Locator> {
  const faces = await boxFaces(page);
  await railButton(page, 'Fixed').click();
  await page.mouse.click(faces.end.x, faces.end.y);
  const panel = page.getByRole('complementary', { name: 'Fixed' });
  await expect(panel).toContainText('1 face');
  if (done) await panel.getByRole('button', { name: 'Done' }).click();
  return panel;
}

/** A force on the front of the box. */
export async function pushFront(page: Page, done = true): Promise<Locator> {
  const faces = await boxFaces(page);
  await railButton(page, 'Force').click();
  await page.mouse.click(faces.front.x, faces.front.y);
  const panel = page.getByRole('complementary', { name: 'Force' });
  await expect(panel).toContainText('1 face');
  if (done) await panel.getByRole('button', { name: 'Done' }).click();
  return panel;
}

/** Fixed at one end, pushed on the front, solved. */
export async function solved(page: Page): Promise<void> {
  await simulating(page);
  await fixEnd(page);
  await pushFront(page);
  // The force tool stays active after Done; drop it so no hint covers the result.
  await page.keyboard.press('Escape');
  await page.locator('.sim-solve').click();
  await expect(page.locator('.sim-legend')).toBeVisible({ timeout: 120_000 });
}

/**
 * The box made into a part worth drawing and rendering: the top/end seam rounded and a 5 mm hole
 * drilled off centre in the top face. A plain box shows nothing of a drawing's dimensions or a
 * render's finish.
 */
export async function shownPart(page: Page): Promise<void> {
  await addBox(page);
  // The seam where the top face meets the +X side, as in e2e/modeling/gizmo.spec.ts.
  const point = screenPointOf(await canvasRect(page), { x: 40, y: 10, z: 15 });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.edge-gizmo__bar')).toBeVisible({ timeout: 60_000 });
  await page.locator('.edge-gizmo__value').click();
  const radius = page.locator('.edge-gizmo__value--input');
  await radius.fill('3');
  await radius.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0, { timeout: 120_000 });
  // Hole drills where the face was clicked.
  await page.keyboard.press('Escape');
  const top = screenPointOf(await canvasRect(page), { x: 28, y: 10, z: 15 });
  await page.mouse.click(top.x, top.y);
  const hole = railButton(page, 'Hole');
  if (!(await hole.isVisible())) await railButton(page, 'Tools').click();
  await hole.click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator('.inspector .move-gizmo__heading strong')).toHaveText('Hole', {
    timeout: 60_000,
  });
  await page.keyboard.press('Escape');
  // Close the flyout and panel: pictures of other workspaces should not show them.
  if (await railButton(page, 'Hole').isVisible()) await railButton(page, 'Tools').click();
}
