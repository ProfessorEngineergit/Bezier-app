/**
 * Nib's first guided lesson, done step by step in the real editor; Nib must notice each step. This
 * also checks that the step targets exist (the rail's Sketch, Rectangle and Finish Sketch, the edge
 * handle, Items) and that the editor reports the body and the round as the journal operations the
 * guide waits for. It does not depend on whether Nib is rendered live or as an image.
 */

import type { Page } from '@playwright/test';
import { canvasRect, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

/** Nib's speech: the card the top island opens into. */
const bubble = (page: Page) => page.locator('.nib-island[data-kind="speech"] .nib-island__card');
/** The ring around a step's target. */
const ring = (page: Page) => page.locator('.nib-ring:not([hidden])');

/**
 * Clicks down the middle of the view until an edge is picked. Edge positions depend on the
 * rectangle, and the lesson waits for the edge gizmo, not a particular edge.
 */
async function clickAnEdge(page: Page): Promise<void> {
  const rect = await canvasRect(page);
  for (let i = 0; i <= 60; i++) {
    const y = rect.y + rect.height * (0.25 + i * 0.008);
    await page.mouse.click(rect.x + rect.width * 0.5, y);
    if ((await page.locator('.edge-gizmo').count()) > 0) return;
  }
  throw new Error('No edge found down the middle of the view');
}

async function onLandingAsAStranger(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    // Reset Nib only once, not on every load: the first test reloads.
    if (sessionStorage.getItem('forgot-nib') === null) {
      sessionStorage.setItem('forgot-nib', '1');
      localStorage.removeItem('bezier.nib');
    }
    const key = 'bezier.preferences';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const prefs = (stored.values as Record<string, unknown> | undefined) ?? stored;
    prefs.startPage = 'home';
    // The start-page greeting belongs to the Friendly setting; the app defaults to Quiet.
    if (prefs.nib === undefined) prefs.nib = 'friendly';
    localStorage.setItem(key, JSON.stringify(stored.values ? stored : prefs));
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Bezier', exact: true })).toBeVisible();
}

test('he greets a stranger once, and can be put off', async ({ page }) => {
  await onLandingAsAStranger(page);
  await expect(bubble(page)).toContainText("I'm Nib", { timeout: 15_000 });
  await bubble(page).getByRole('button', { name: 'Not now' }).click();
  await expect(bubble(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Bezier', exact: true })).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(bubble(page)).toHaveCount(0);
});

test('the first lesson: a rectangle, a body from it, then a rounded edge, each step noticed', async ({
  page,
}) => {
  await onLandingAsAStranger(page);
  await bubble(page).getByRole('button', { name: 'Show me' }).click({ timeout: 15_000 });

  // 1. A new project. The ring is drawn around the button he points at.
  await expect(bubble(page)).toContainText('a new project');
  await expect(ring(page)).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();

  // 2. Into the editor, with Sketch ringed: a part starts as a drawing.
  await expect(bubble(page)).toContainText('Open Sketch');
  await expect(page.locator('.nib-island')).toHaveAttribute('data-shape', 'card');
  await expect(ring(page)).toHaveCSS('opacity', '1');
  await railButton(page, 'Sketch').click();

  // 3. Pick the floor, draw a rectangle, leave the sketch.
  await expect(bubble(page)).toContainText('Click the grid');
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(bubble(page)).toContainText('Press Rectangle');
  await railButton(page, 'Rectangle').click();
  const diagonal = railButton(page, 'Diagonal');
  if (await diagonal.isVisible()) await diagonal.click();
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await expect(bubble(page)).toContainText('Finish Sketch');
  await railButton(page, 'Finish Sketch').click();

  // 4. Extrude the profile into a body.
  await expect(bubble(page)).toContainText('Click inside the rectangle');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  const distance = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await distance.fill('15');
  await distance.press('Enter');

  // 5. An edge. He only looks toward the viewport; no ring around all of it.
  await expect(bubble(page)).toContainText('click one of its edges');
  await expect(ring(page)).toHaveCount(0);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await clickAnEdge(page);

  // 6. The round.
  await expect(bubble(page)).toContainText('drag the blue handle');
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('3');
  await page.locator('.edge-gizmo__value--input').press('Enter');

  // 7. Done: one button, and the lesson is remembered.
  await expect(bubble(page)).toContainText('That is a part');
  await bubble(page).getByRole('button', { name: 'Nice' }).click();
  await expect(bubble(page)).toHaveCount(0);
  const memory = await page.evaluate(() => localStorage.getItem('bezier.nib'));
  expect(memory).toContain('first-part');
});

test('a step can be skipped, and the lesson can be closed without counting as done', async ({
  page,
}) => {
  await onLandingAsAStranger(page);
  await bubble(page).getByRole('button', { name: 'Show me' }).click({ timeout: 15_000 });
  await expect(bubble(page)).toContainText('a new project');
  await bubble(page).getByRole('button', { name: 'Skip this step' }).click();
  await expect(bubble(page)).toContainText('Open Sketch');
  // Only the × ends it.
  await page.locator('.nib-island').getByRole('button', { name: 'End the lesson' }).click();
  await expect(bubble(page)).toHaveCount(0);
  const memory = await page.evaluate(() => localStorage.getItem('bezier.nib'));
  expect(memory).not.toContain('first-part');
});
