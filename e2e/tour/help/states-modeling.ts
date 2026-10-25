/**
 * Pictures for the modeling articles. Each shows the feature's result on the model together with
 * the panel or handle that made it: part at rest, nothing hovered, no open flyout, no debug
 * readout.
 */

import type { Locator, Page } from '@playwright/test';
import {
  afterFrames,
  canvasRect,
  doubleClickAt,
  openItems,
  pickAt,
  railButton,
  screenPointOf,
} from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';
import { at, boxAtRest, finish, rectangleAt, sketching } from './world.js';

/** Small enough for the Items panel, the model and a panel to fit at a readable size. */
const WINDOW = { width: 1200, height: 760 };

async function stage(page: Page): Promise<void> {
  await page.setViewportSize(WINDOW);
  await afterFrames(page);
}

/** Moves the pointer away and hides the last-click readout (it shows raw references). */
async function rest(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.selection { display: none !important; }' });
  await page.mouse.move(600, 8);
}

/** Zooms out so the panels do not cover the model. */
async function back(page: Page, notches = 1): Promise<void> {
  const rect = await canvasRect(page);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  for (let i = 0; i < notches; i += 1) {
    await page.mouse.wheel(0, 240);
    await afterFrames(page);
  }
  await page.waitForTimeout(700);
}

async function zoomFit(page: Page): Promise<void> {
  await page.keyboard.press('Shift+F');
  await afterFrames(page);
  await page.waitForTimeout(700);
}

/** Runs a tool from a rail group: opens the group if closed, presses the tool, closes it again. */
async function tool(page: Page, group: 'Tools' | 'Transform', name: string): Promise<void> {
  const button = railButton(page, name);
  if (!(await button.isVisible())) await railButton(page, group).click();
  await button.click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  if (await button.isVisible()) await railButton(page, group).click();
}

async function idle(page: Page): Promise<void> {
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await afterFrames(page);
}

/** The step's panel and its Items row: the subject of a step picture. */
async function step(
  page: Page,
  title: string,
  panel = title,
): Promise<{ inspector: Locator; row: Locator }> {
  await openItems(page);
  const inspector = page.locator('.inspector');
  const row = page.locator('.items-row', { hasText: panel });
  // Some steps open their panel when created; others when their row is picked.
  if ((await inspector.locator('.move-gizmo__heading strong').count()) === 0) await row.click();
  await expect(inspector.locator('.move-gizmo__heading strong')).toHaveText(panel);
  return { inspector, row };
}

async function inspected(page: Page, title: string, field: string, panel = title) {
  const { inspector, row } = await step(page, title, panel);
  const control = inspector.getByLabel(field, { exact: true });
  await expect(control).toBeVisible();
  await rest(page);
  return { points: [control], row, inspector };
}

async function setField(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Enter');
}

/** The box with a hole near one end: a part that is not symmetric. */
async function holedBox(page: Page): Promise<void> {
  await stage(page);
  await boxAtRest(page);
  await pickAt(page, { x: 10, y: 10, z: 15 });
  await tool(page, 'Tools', 'Hole');
  const { inspector } = await step(page, 'Hole');
  await setField(inspector.getByLabel('Diameter', { exact: true }), '6');
  await idle(page);
}

/** The box and a copy beside it, with the copy picked. */
async function boxAndCopy(page: Page): Promise<void> {
  await stage(page);
  await boxAtRest(page);
  await openItems(page);
  await page.locator('.body-row', { hasText: 'Body 1' }).click();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(page.locator('.body-row')).toHaveText(['Body 1', 'Body 2']);
  await idle(page);
}

/** A rectangle drawn in the top view, finished, seen from the default angle. */
async function sketchedRectangle(page: Page): Promise<void> {
  await stage(page);
  await sketching(page);
  await rectangleAt(page, [0.28, 0.3], [0.72, 0.7]);
  await finish(page);
  await page.keyboard.press('ControlOrMeta+1');
  await afterFrames(page);
  await page.waitForTimeout(700);
}

/** A 4 mm fillet on the front top edge, made as the article describes: pick, type, Enter. */
async function roundedEdge(page: Page): Promise<void> {
  await stage(page);
  await boxAtRest(page);
  await pickAt(page, { x: 20, y: 0, z: 15 });
  await expect(page.locator('.edge-gizmo__bar')).toBeVisible();
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await idle(page);
  await expect(page.locator('.edge-gizmo__value')).toContainText('R4');
}

export const MODELING: Record<string, State> = {
  'extrude-gizmo': async (page) => {
    await sketchedRectangle(page);
    await page.keyboard.press('e');
    const field = page.getByRole('spinbutton', { name: 'Extrude distance' });
    await expect(field).toBeVisible();
    await field.fill('30');
    await idle(page);
    await rest(page);
    return { points: [field], whole: true };
  },
  'extrude-options': async (page) => {
    await sketchedRectangle(page);
    await page.keyboard.press('e');
    const options = page.getByRole('button', { name: 'Extrude options' });
    await options.click();
    await expect(page.getByLabel('Extrude direction')).toBeVisible();
    await page.getByRole('spinbutton', { name: 'Extrude distance' }).fill('30');
    await idle(page);
    await rest(page);
    return { points: [options], whole: true };
  },
  'fillet-handle': async (page) => {
    await roundedEdge(page);
    await rest(page);
    return { points: [page.locator('.edge-gizmo__handle')], whole: true };
  },
  'fillet-menu': async (page) => {
    await roundedEdge(page);
    await page.locator('.edge-gizmo__kind').click();
    const chamfer = page.locator('.edge-gizmo__menu-item').filter({ hasText: 'Chamfer' });
    await expect(chamfer).toBeVisible();
    await rest(page);
    return { points: [chamfer], whole: true };
  },
  'fillet-reopen': async (page) => {
    await roundedEdge(page);
    // The face created by the round: clicking it brings the same handle back.
    await pickAt(page, { x: 20, y: 1.2, z: 13.8 });
    const value = page.locator('.edge-gizmo__value');
    await expect(value).toContainText('R4');
    await rest(page);
    return { points: [value], whole: true };
  },
  'shell-face': async (page) => {
    await stage(page);
    await boxAtRest(page);
    await pickAt(page, { x: 20, y: 10, z: 15 });
    await expect(page.locator('.extrude-gizmo')).toBeVisible();
    await rest(page);
    return { points: [], whole: true };
  },
  'shell-inspector': async (page) => {
    await stage(page);
    await boxAtRest(page);
    await pickAt(page, { x: 20, y: 10, z: 15 });
    await page.keyboard.press('h');
    await idle(page);
    const { points } = await inspected(page, 'Shell', 'Thickness');
    return { points, whole: true };
  },
  'hole-inspector': async (page) => {
    await stage(page);
    await boxAtRest(page);
    await pickAt(page, { x: 20, y: 10, z: 15 });
    await tool(page, 'Tools', 'Hole');
    const { inspector } = await step(page, 'Hole');
    await setField(inspector.getByLabel('Diameter', { exact: true }), '8');
    await idle(page);
    // The pull handle of the hole's face is not part of the Hole step.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Escape');
    if ((await page.locator('.extrude-gizmo').count()) > 0)
      await page.addStyleTag({ content: '.extrude-gizmo { display: none !important; }' });
    const { points } = await inspected(page, 'Hole', 'Diameter');
    return { points, whole: true };
  },
  'revolve-inspector': async (page) => {
    await stage(page);
    // Front view, so the sketch stands upright with its vertical axis pointing up.
    await page.keyboard.press('ControlOrMeta+2');
    await afterFrames(page);
    await railButton(page, 'Sketch').click();
    await page.keyboard.press('l');
    // Half a bottle profile, out from the vertical axis and above the horizontal one.
    for (const [x, y] of [
      [0.5, 0.5],
      [0.64, 0.5],
      [0.64, 0.34],
      [0.565, 0.26],
      [0.565, 0.14],
      [0.5, 0.14],
      [0.5, 0.5],
    ] as const)
      await at(page, x, y);
    await page.keyboard.press('Escape');
    await finish(page);
    await page.keyboard.press('v');
    await idle(page);
    const { points, inspector } = await inspected(page, 'Revolve', 'Axis');
    await inspector.getByLabel('Axis', { exact: true }).selectOption('v');
    await idle(page);
    await page.keyboard.press('ControlOrMeta+1');
    await afterFrames(page);
    await zoomFit(page);
    await back(page, 1);
    await rest(page);
    return { points, whole: true };
  },
  'combine-inspector': async (page) => {
    await boxAndCopy(page);
    // The copy overlaps the original, so the join yields one part.
    await page.locator('.items-row', { hasText: 'Duplicate' }).click();
    const inspector = page.locator('.inspector');
    await setField(inspector.getByLabel('X', { exact: true }), '25');
    await setField(inspector.getByLabel('Z', { exact: true }), '8');
    await idle(page);
    await page.locator('.body-row', { hasText: 'Body 1' }).click();
    await page.locator('.body-row', { hasText: 'Body 2' }).click({ modifiers: ['ControlOrMeta'] });
    await tool(page, 'Tools', 'Combine');
    await idle(page);
    const { points } = await inspected(page, 'Combine', 'Operation', 'Union');
    await zoomFit(page);
    await back(page, 1);
    await rest(page);
    return { points, whole: true };
  },
  'split-inspector': async (page) => {
    await stage(page);
    await boxAtRest(page);
    await openItems(page);
    await page.locator('.body-row', { hasText: 'Body 1' }).click();
    await page.keyboard.press('k');
    await idle(page);
    const { points } = await inspected(page, 'Split', 'Offset');
    // Hide one half so the cut shows.
    const second = page.locator('.body-row', { hasText: 'Body 2' });
    await second.hover();
    await page.getByRole('button', { name: 'Hide Body 2' }).click();
    await idle(page);
    await rest(page);
    return { points, whole: true };
  },
  'move-rotate-gizmo': async (page) => {
    await stage(page);
    await boxAtRest(page);
    await doubleClickAt(page, { x: 20, y: 10, z: 15 });
    const toolbar = page.getByRole('toolbar', { name: 'Move and rotate' });
    await expect(toolbar).toBeVisible();
    await rest(page);
    return { points: [toolbar], whole: true };
  },
  'scale-inspector': async (page) => {
    await boxAndCopy(page);
    await page.keyboard.press('s');
    await idle(page);
    const { points, inspector } = await inspected(page, 'Scale', 'Factor');
    await setField(inspector.getByLabel('Factor', { exact: true }), '0.5');
    await idle(page);
    await zoomFit(page);
    await back(page, 1);
    await rest(page);
    return { points, whole: true };
  },
  'mirror-inspector': async (page) => {
    await holedBox(page);
    await page.locator('.body-row', { hasText: 'Body 1' }).click();
    await tool(page, 'Transform', 'Mirror');
    await expect(page.locator('.body-row')).toHaveCount(2);
    const { points } = await inspected(page, 'Mirror', 'Plane');
    await zoomFit(page);
    await back(page, 1);
    await rest(page);
    return { points, whole: true };
  },
  'pattern-inspector': async (page) => {
    await holedBox(page);
    await page.locator('.body-row', { hasText: 'Body 1' }).click();
    await tool(page, 'Transform', 'Pattern');
    await expect(page.locator('.body-row')).toHaveCount(3);
    const { points } = await inspected(page, 'Pattern', 'Count');
    await zoomFit(page);
    await back(page, 1);
    await rest(page);
    return { points, whole: true };
  },
  'bodies-list': async (page) => {
    await boxAndCopy(page);
    await page.locator('.body-row', { hasText: 'Body 2' }).dblclick();
    const field = page.getByRole('textbox', { name: 'Rename Body 2' });
    await field.fill('Lid');
    await field.press('Enter');
    const lid = page.locator('.body-row', { hasText: 'Lid' });
    await expect(lid).toBeVisible();
    await page.locator('.body-row', { hasText: 'Body 1' }).hover();
    const eye = page.getByRole('button', { name: 'Hide Body 1' });
    await eye.click();
    await idle(page);
    await zoomFit(page);
    await back(page, 1);
    await rest(page);
    return { points: [lid], whole: true };
  },
  'selecting-filter': async (page) => {
    await stage(page);
    await boxAtRest(page);
    await page.keyboard.press('Tab');
    const filter = page.locator('.selection-filter');
    await expect(filter).toBeVisible();
    // The face under the pointer highlights: what a click would pick.
    const over = screenPointOf(await canvasRect(page), { x: 20, y: 10, z: 15 });
    await page.mouse.move(over.x, over.y);
    await afterFrames(page);
    await page.addStyleTag({ content: '.selection { display: none !important; }' });
    return { points: [filter], whole: true };
  },
  'selecting-rectangle': async (page) => {
    await stage(page);
    await boxAtRest(page);
    await back(page, 1);
    const rect = await canvasRect(page);
    // From empty space, left to right: what lies wholly inside is picked on release.
    await page.mouse.move(rect.x + rect.width * 0.18, rect.y + rect.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5, { steps: 6 });
    await page.mouse.move(rect.x + rect.width * 0.82, rect.y + rect.height * 0.82, { steps: 6 });
    await page.addStyleTag({ content: '.selection { display: none !important; }' });
    const marquee = page.locator('.viewport-marquee');
    await expect(marquee).toBeVisible();
    return { points: [marquee], whole: true };
  },
};
