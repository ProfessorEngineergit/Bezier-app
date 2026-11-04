/**
 * The edge gizmo: selecting an edge shows the round/bevel gizmo, and committing creates a real
 * fillet or chamfer. Both the drag and the typed path are tested, since they reach the commit by
 * different routes.
 */

import {
  addBox,
  afterFrames,
  canvasRect,
  openApp,
  openItems,
  pickAt,
  screenPointOf,
} from '../app.js';
import { expect, test } from '../fixtures.js';

/** The seam where the top face meets the +X side: a single edge. */
const EDGE = { x: 40, y: 10, z: 15 };

async function selectEdge(page: import('@playwright/test').Page) {
  const point = screenPointOf(await canvasRect(page), EDGE);
  await page.mouse.click(point.x, point.y);
  // Wait on the bar, not the root: the root is a zero-sized anchor for the projected position, and
  // a zero-sized box never counts as visible.
  await expect(page.locator('.edge-gizmo__bar')).toBeVisible();
}

/** Opens the operation menu and picks an option. The pill shows the mode; it does not toggle. */
async function choose(page: import('@playwright/test').Page, option: 'Fillet' | 'Chamfer') {
  await page.locator('.edge-gizmo__kind').click();
  await page.locator('.edge-gizmo__menu-item', { hasText: option }).click();
}

test('selecting an edge raises the gizmo, defaulting to Fillet', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);

  await expect(page.locator('.edge-gizmo__kind')).toContainText('Fillet');
  // The value reads as a radius for a round.
  await expect(page.locator('.edge-gizmo__value')).toHaveText(/^R[\d.]+mm$/);
  // One shaft and one inward head.
  await expect(page.locator('.edge-gizmo__handle svg path')).toHaveCount(2);
  const at = screenPointOf(await canvasRect(page), EDGE);
  const anchor = await page.locator('.edge-gizmo').boundingBox();
  expect(anchor).not.toBeNull();
  if (anchor) {
    expect(anchor.x).toBeCloseTo(at.x, 0);
    expect(anchor.y).toBeCloseTo(at.y, 0);
  }
});

test('the extrude arrow follows the face normal while its value stays readable', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  const side = { x: 40, y: 10, z: 7.5 };
  await pickAt(page, side);

  const handle = page.getByRole('button', { name: 'Drag to change extrude distance' });
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('style', /rotate\(/);
  const before = await handle.getAttribute('style');

  const at = screenPointOf(await canvasRect(page), side);
  const anchor = await page.locator('.extrude-gizmo').boundingBox();
  expect(anchor).not.toBeNull();
  if (anchor) {
    expect(anchor.x).toBeCloseTo(at.x, 0);
    expect(anchor.y).toBeCloseTo(at.y, 0);
  }

  const rect = await canvasRect(page);
  await page.mouse.move(rect.x + rect.width * 0.65, rect.y + rect.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(rect.x + rect.width * 0.35, rect.y + rect.height * 0.42, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(180);

  await expect(handle).toBeVisible();
  await expect(handle).not.toHaveAttribute('style', before ?? '');
  await expect(page.locator('.extrude-gizmo__value')).not.toHaveAttribute('style', /rotate\(/);
});

test('the solid a pull edits is ready when the pointer reaches the arrow, not after the first step', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 40, y: 10, z: 7.5 });
  const handle = page.getByRole('button', { name: 'Drag to change extrude distance' });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  const prepared = () =>
    page.evaluate(() => performance.getEntriesByName('bezier:part-start').length);
  await page.evaluate(() => performance.clearMeasures());
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await expect.poll(prepared).toBe(1);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 10, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  expect(await prepared()).toBe(1);
});

test('the menu switches the gizmo between Fillet and Chamfer', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);

  await choose(page, 'Chamfer');
  await expect(page.locator('.edge-gizmo__kind')).toContainText('Chamfer');
  // A bevel's size is a setback, not a radius: no leading R.
  await expect(page.locator('.edge-gizmo__value')).toHaveText(/^[\d.]+mm$/);
});

test('the menu closes without committing anything', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);

  // Choosing Chamfer sets what the next commit will be; it must not create a feature by itself.
  await choose(page, 'Chamfer');
  await expect(page.locator('.edge-gizmo__menu')).toHaveCount(0);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});

test('typing a value and pressing Enter commits a real fillet', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);

  await page.locator('.edge-gizmo__value').click();
  const field = page.locator('.edge-gizmo__value--input');
  await field.fill('3');
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Fillet']);
});

test('clicking the value and typing replaces the size', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);
  await page.locator('.edge-gizmo__value').click();
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await expect(page.locator('.edge-gizmo__value')).toHaveText('R4mm');

  await page.locator('.edge-gizmo__value').click();
  await page.keyboard.type('3');
  await page.keyboard.press('Enter');
  await expect(page.locator('.edge-gizmo__value')).toHaveText('R3mm');
});

test('several edges share one size', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await addBox(page);
  await selectEdge(page);

  const second = screenPointOf(await canvasRect(page), { x: 20, y: 0, z: 15 });
  await page.keyboard.down('Shift');
  await page.mouse.click(second.x, second.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('.edge-gizmo__bar')).toBeVisible();

  await page.locator('.edge-gizmo__value').click();
  const field = page.locator('.edge-gizmo__value--input');
  await field.fill('3');
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Fillet']);
  // The second edge is rounded as well: what was its corner is not on the solid any more.
  const rect = await canvasRect(page);
  const hit = await page.evaluate(
    ([x, y]) =>
      (
        window as unknown as {
          __bezierViewport: { pick(x: number, y: number): { point: { z: number } } | null };
        }
      ).__bezierViewport.pick(x ?? 0, y ?? 0),
    [second.x - rect.x, second.y - rect.y],
  );
  expect(hit?.point.z ?? 0).toBeLessThan(14.9);
});

test('Delete on a rounded face takes that rounding away', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('3');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await pickAt(page, { x: 37 + 3 / Math.sqrt(2), y: 10, z: 12 + 3 / Math.sqrt(2) });
  await page.keyboard.press('Backspace');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});

test('a rounded face reopens its radius and zero removes the fillet', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('3');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await pickAt(page, { x: 37 + 3 / Math.sqrt(2), y: 10, z: 12 + 3 / Math.sqrt(2) });
  await expect(page.locator('.edge-gizmo__value')).toHaveText('R3mm');
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('1');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Fillet']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('0');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});

test('switching to Chamfer and typing commits a real chamfer', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);

  await choose(page, 'Chamfer');
  await page.locator('.edge-gizmo__value').click();
  const field = page.locator('.edge-gizmo__value--input');
  await field.fill('2');
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Chamfer']);
});

test('the shape changes while the handle is dragged, before it is released', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await selectEdge(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);

  const handle = page.getByRole('button', { name: 'Drag to size' });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const from = {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
  };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y, { steps: 10 });

  // Still held: the drag must show its result live. The preview draws the rounded part in place of
  // the box without touching the document (`session-part-edit.ts`), so the canvas shows it while
  // the item list is unchanged until release.
  await expect(page.locator('.edge-gizmo__value')).not.toHaveText(/^R?0mm$/);
  await expect(page.locator('canvas.viewport[data-part-preview]')).toHaveCount(1);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);

  // Fillet or chamfer depends on which side of the edge the pointer went, along the arrow's
  // projected direction rather than screen X, so either is accepted.
  await page.mouse.up();
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', /Fillet|Chamfer/]);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('after a dragged round the preview is gone and the part can be picked again', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);

  const handle = page.getByRole('button', { name: 'Drag to size' });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const from = {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
  };

  // Released while the last step's preview is still on its way: it must not land on the result.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 12, from.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await afterFrames(page);

  await expect(page.locator('canvas.viewport[data-part-preview]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect.poll(() => pickAt(page, { x: 20, y: 10, z: 15 })).toMatch(/^F:/);
});

test('the edge arrow keeps its size on screen while the view zooms', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);

  /** The drawn arrow's extent on screen. */
  const arrowSize = () =>
    page
      .locator('.edge-gizmo__handle svg path')
      .first()
      .evaluate((path) => {
        const box = (path as SVGGraphicsElement).getBBox();
        return Math.max(box.width, box.height);
      });

  const before = await arrowSize();
  expect(before).toBeGreaterThan(0);

  // The arrow is a control, not model geometry, so pulling the camera back must not shrink it; its
  // world size is recomputed from the current viewing distance.
  const rect = await canvasRect(page);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(500);

  const after = await arrowSize();
  expect(after / before).toBeGreaterThan(0.8);
  expect(after / before).toBeLessThan(1.25);
});

test('a round too large offers the largest that fits, and one click builds it', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await selectEdge(page);
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('500');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  const offer = page.locator('.edge-gizmo__offer');
  await expect(offer).toHaveText(/^Use R[\d.]+$/);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
  await offer.click();
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Fillet']);
  await expect(offer).toHaveCount(0);
});

test('a finished round made too large keeps its size and offers the largest that fits', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await selectEdge(page);
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('3');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await pickAt(page, { x: 37 + 3 / Math.sqrt(2), y: 10, z: 12 + 3 / Math.sqrt(2) });
  await expect(page.locator('.edge-gizmo__value')).toHaveText('R3mm');
  await openItems(page);
  await page.locator('.edge-gizmo__value').click();
  await page.locator('.edge-gizmo__value--input').fill('500');
  await page.locator('.edge-gizmo__value--input').press('Enter');
  const offer = page.locator('.edge-gizmo__offer');
  await expect(offer).toHaveText(/^Use R[\d.]+$/);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
  await offer.click();
  await expect(offer).toHaveCount(0);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Fillet']);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
});

test('a drag past what fits stays at the last size it showed', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  await selectEdge(page);
  const handle = page.getByRole('button', { name: 'Drag to size' });
  const box = await handle.boundingBox();
  if (box === null) throw new Error('the handle is not on screen');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y, { steps: 8 });
  await expect(page.locator('canvas.viewport[data-part-preview]')).toHaveCount(1);
  await page.waitForTimeout(400);
  await page.mouse.move(from.x + 1100, from.y, { steps: 20 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', /Fillet|Chamfer/]);
  await expect(page.locator('.items-row__status')).toHaveCount(0);
  await expect(page.locator('.edge-gizmo__offer')).toHaveCount(0);
});
