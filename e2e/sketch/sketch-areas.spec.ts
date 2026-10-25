/**
 * Multiple sketches, areas and touching parts. Sketch always starts a new sketch, every sketch with
 * an unused area stays visible, and every closed area can be clicked and extruded independently.
 */

import type { Page } from '@playwright/test';
import { canvasRect, openApp, openItems, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Starts a new sketch on the plane at the centre of the empty view. */
async function newSketch(page: Page) {
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

/** Draws a rectangle between two points given as canvas fractions. */
async function rectangle(page: Page, box: Box) {
  const rect = await canvasRect(page);
  await page.keyboard.press('r');
  await page.mouse.click(rect.x + rect.width * box.x0, rect.y + rect.height * box.y0);
  await page.mouse.click(rect.x + rect.width * box.x1, rect.y + rect.height * box.y1);
  await page.keyboard.press('Escape');
}

/** Clicks inside an area and extrudes it to a typed distance. */
async function extrudeAt(page: Page, fx: number, fy: number, distance: string) {
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
  // A number field off a part, a signed text field on a face: matched by name either way.
  const field = page.getByLabel('Extrude distance', { exact: true });
  await field.fill(distance);
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

/**
 * Squares the view to Top so Sketch starts directly on XY. Used where two sketches must share a
 * plane: clicking the middle of the view would pick the first part's face instead.
 */
async function fromTop(page: Page) {
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(600);
}

async function onTop(page: Page) {
  await railButton(page, 'Sketch').click();
  await expect(
    page.locator('.rail--left .rail__label', { hasText: 'Finish Sketch' }).locator('.rail__detail'),
  ).toHaveText('XY plane');
}

async function clickEmpty(page: Page) {
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * 0.75, rect.y + rect.height * 0.8);
}

async function finish(page: Page) {
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

test('a second sketch drawn before extruding the first leaves both extrudable', async ({
  page,
}) => {
  await openApp(page);
  await newSketch(page);
  await rectangle(page, { x0: 0.3, y0: 0.42, x1: 0.4, y1: 0.58 });
  await finish(page);

  await newSketch(page);
  await rectangle(page, { x0: 0.6, y0: 0.42, x1: 0.7, y1: 0.58 });
  await finish(page);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Sketch 2']);

  await extrudeAt(page, 0.35, 0.5, '10');
  await extrudeAt(page, 0.65, 0.5, '10');
  await expect(page.locator('.items-row')).toHaveText([
    'Sketch 1',
    'Sketch 2',
    'Extrude',
    'Extrude',
  ]);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await expect(page.locator('.body-row')).toHaveCount(2);
});

test('two shapes in one sketch are two areas, each extruded on its own', async ({ page }) => {
  await openApp(page);
  await newSketch(page);
  await rectangle(page, { x0: 0.3, y0: 0.42, x1: 0.4, y1: 0.58 });
  await rectangle(page, { x0: 0.6, y0: 0.42, x1: 0.7, y1: 0.58 });
  await finish(page);

  await extrudeAt(page, 0.65, 0.5, '8');
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  // The other area is still available in the same sketch.
  await extrudeAt(page, 0.35, 0.5, '8');
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Extrude']);
  await expect(page.locator('.body-row')).toHaveCount(2);
});

test('a shape inside another is a hole in it', async ({ page }) => {
  await openApp(page);
  await newSketch(page);
  await rectangle(page, { x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.7 });
  await rectangle(page, { x0: 0.45, y0: 0.45, x1: 0.55, y1: 0.55 });
  await finish(page);

  // The ring between the two, clicked near the outer edge.
  await extrudeAt(page, 0.35, 0.35, '5');
  await openItems(page);
  await page.locator('.items-row', { hasText: 'Extrude' }).click();
  // Exposed in the panel's data, not shown: the bar only has room for fields.
  await expect(
    page.locator('.inspector').getByText('One area, picked in the viewport'),
  ).toHaveCount(1);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('a part drawn into another asks whether to join, cut, or keep it apart', async ({ page }) => {
  await openApp(page);
  await fromTop(page);
  await onTop(page);
  await rectangle(page, { x0: 0.35, y0: 0.42, x1: 0.5, y1: 0.58 });
  await finish(page);
  await extrudeAt(page, 0.4, 0.5, '10');
  // After an extrude the new top face is selected and Sketch would start on it. Click empty space
  // to get the origin plane again.
  await clickEmpty(page);

  await onTop(page);
  await rectangle(page, { x0: 0.45, y0: 0.44, x1: 0.62, y1: 0.56 });
  await finish(page);
  await extrudeAt(page, 0.58, 0.5, '6');

  const prompt = page.getByRole('dialog', { name: 'Bodies meet' });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('button', { name: /^Cut from/ })).toBeVisible();
  await prompt.getByRole('button', { name: 'Join' }).click();
  await expect(prompt).toHaveCount(0);

  await openItems(page);
  await expect(page.locator('.items-row', { hasText: 'Join' })).toBeVisible();
  await expect(page.locator('.body-row')).toHaveCount(1);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('keeping a part apart leaves two bodies and asks nothing more', async ({ page }) => {
  await openApp(page);
  await fromTop(page);
  await onTop(page);
  await rectangle(page, { x0: 0.35, y0: 0.42, x1: 0.5, y1: 0.58 });
  await finish(page);
  await extrudeAt(page, 0.4, 0.5, '10');
  // After an extrude the new top face is selected and Sketch would start on it. Click empty space
  // to get the origin plane again.
  await clickEmpty(page);

  await onTop(page);
  await rectangle(page, { x0: 0.45, y0: 0.44, x1: 0.62, y1: 0.56 });
  await finish(page);
  await extrudeAt(page, 0.58, 0.5, '6');

  const prompt = page.getByRole('dialog', { name: 'Bodies meet' });
  await prompt.getByRole('button', { name: 'New body' }).click();
  await expect(prompt).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.body-row')).toHaveCount(2);
});

test('a sketch drawn on a face of a part adds to that part', async ({ page }) => {
  await openApp(page);
  await fromTop(page);
  await onTop(page);
  await rectangle(page, { x0: 0.35, y0: 0.35, x1: 0.65, y1: 0.65 });
  await finish(page);
  await extrudeAt(page, 0.5, 0.5, '10');

  // Pick the top face while choosing where to sketch: the face becomes the plane.
  await railButton(page, 'Sketch').click();
  const guard = page
    .locator('.rail--left .rail__label', { hasText: 'Finish Sketch' })
    .locator('.rail__detail');
  const rect = await canvasRect(page);
  // Squared to Top the view offers XY directly, so select the face first and sketch on it.
  await railButton(page, 'Finish Sketch').click();
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await railButton(page, 'Sketch').click();
  await expect(guard).toHaveText('On a face');
  await rectangle(page, { x0: 0.45, y0: 0.45, x1: 0.55, y1: 0.55 });
  await finish(page);
  await extrudeAt(page, 0.5, 0.5, '5');

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText([
    'Sketch 1',
    'Extrude',
    'Sketch 2',
    'Extrude',
  ]);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  // Joined to the part it stands on: still one body.
  await expect(page.locator('.body-row')).toHaveCount(1);
});

test('a sketch can be reopened from the Items list and edited in place', async ({ page }) => {
  await openApp(page);
  await newSketch(page);
  await rectangle(page, { x0: 0.3, y0: 0.42, x1: 0.4, y1: 0.58 });
  await finish(page);
  await openItems(page);
  await page.getByRole('button', { name: 'Edit Sketch' }).click();
  await expect(railButton(page, 'Finish Sketch')).toBeVisible();
  await rectangle(page, { x0: 0.6, y0: 0.42, x1: 0.7, y1: 0.58 });
  await finish(page);
  // Still one sketch, now with two areas.
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1']);
  await extrudeAt(page, 0.65, 0.5, '5');
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});
