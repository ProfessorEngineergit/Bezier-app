/**
 * Helpers for driving the real application. `screenPointOf` computes where a world point lands on
 * screen using the viewport's own `frameBounds`, so clicks stay precise when the framing changes.
 */

import { frameBounds } from '@bezier/renderer';
import { expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { TEST_INVITE_PUBLIC_KEY, testInviteCode } from './invite-test-key.js';

/** The part `Add box` creates: 40 × 20 × 15 mm at the origin. */
export const BOX = { min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 20, z: 15 } };

/**
 * Initial camera direction before framing. Mirrors `ViewportScene`'s constructor; the box-centre
 * assertion in `viewport.spec.ts` fails if the two drift apart.
 */
const START_DIRECTION = { x: 120, y: -160, z: 110 };
const FOV = 45;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function canvasRect(page: Page): Promise<Rect> {
  const box = await page.locator('canvas.viewport').boundingBox();
  if (box === null) throw new Error('the viewport canvas is not on the page');
  return box;
}

/** Projects a world point (Z-up) to page coordinates, framed from the starting direction. */
export function screenPointOf(
  rect: Rect,
  world: { x: number; y: number; z: number },
  bounds = BOX,
): { x: number; y: number } {
  const aspect = rect.width / rect.height;
  const framing = frameBounds(bounds.min, bounds.max, FOV, aspect, START_DIRECTION, {
    x: 0,
    y: 0,
    z: 1,
  });

  const camera = new PerspectiveCamera(FOV, aspect, framing.near, framing.far);
  camera.up.set(0, 0, 1);
  camera.position.set(framing.position.x, framing.position.y, framing.position.z);
  camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const ndc = new Vector3(world.x, world.y, world.z).project(camera);
  return {
    x: rect.x + ((ndc.x + 1) / 2) * rect.width,
    y: rect.y + ((1 - ndc.y) / 2) * rect.height,
  };
}

/** A rail button, found by its accessible name. */
export function railButton(page: Page, name: string) {
  return page.locator('.rail__icon').filter({ has: page.getByText(name, { exact: true }) });
}

/**
 * Opens quick settings on a section. A workspace with only one section shows no tabs and opens
 * directly on it.
 */
export async function quickSettings(page: Page, section: 'View' | 'Display' | 'Units & Grid') {
  const tabs = page.getByRole('tablist', { name: 'Sections' });
  if (!(await tabs.isVisible())) await railButton(page, 'Quick settings').click();
  const tab = page.getByRole('tab', { name: section, exact: true });
  if ((await tab.count()) > 0) await tab.click();
}

/**
 * Waits until the app is idle. The document carries `data-busy` only while a change is in flight
 * (App's `run`); nothing on screen reflects it.
 */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

/**
 * Opens the app in a project with the kernel up and the first rebuild done. The app starts on the
 * project library, so this opens the first project (or a new one). Tests for the start page
 * navigate back to it.
 */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  // Wait for the library to finish loading; before that it may briefly look empty.
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  // Empty projects are not kept, so an empty library means creating one.
  const tile = page.locator('.tile__face').first();
  const empty = page.getByText('No projects yet');
  await expect(tile.or(empty)).toBeVisible();
  if ((await tile.count()) > 0) await tile.click();
  else await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await settle(page);
}

/**
 * Builds the starter box through the rail (category, then command), the path a user takes. Tools
 * is a flyout; see rail.spec.ts.
 */
export async function addBox(page: Page): Promise<void> {
  await railButton(page, 'Tools').click();
  await railButton(page, 'Extrude').click();
  await settle(page);
}

/** Commits the extrude just opened by the Extrude command, which waits for a distance. */
export async function commitExtrude(page: Page, distance = '15'): Promise<void> {
  const field = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await expect(field).toBeVisible();
  await field.fill(distance);
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

/** Shows the item tree, which lives in a drawer. */
export async function openItems(page: Page): Promise<void> {
  if (await page.locator('.items-panel').isVisible()) return;
  const visualize = page
    .locator('.viz-items-rail .rail__icon')
    .filter({ has: page.getByText('Items', { exact: true }) });
  if (await visualize.isVisible()) await visualize.click();
  else await railButton(page, 'Items').click();
  await expect(page.locator('.items-panel')).toBeVisible();
}

/**
 * Waits two animation frames so a click resolves against the presented picture. WebKit may not
 * have presented one right after the model appears.
 */
export async function afterFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}

/** Clicks a world position in the viewport and returns the selection readout, or null on a miss. */
export async function pickAt(
  page: Page,
  world: { x: number; y: number; z: number },
): Promise<string | null> {
  const point = screenPointOf(await canvasRect(page), world);
  await afterFrames(page);
  await page.mouse.click(point.x, point.y);

  // The readout appears only on a hit, so a miss is its absence.
  const selection = page.locator('.selection code').first();
  await page.waitForTimeout(120);
  return (await selection.count()) > 0 ? selection.textContent() : null;
}

/** Click a world position with a modifier held, which adds to or toggles the selection. */
export async function shiftPickAt(
  page: Page,
  world: { x: number; y: number; z: number },
): Promise<void> {
  const point = screenPointOf(await canvasRect(page), world);
  await afterFrames(page);
  await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
}

/** Double-click a world position, which selects the whole body under it. */
export async function doubleClickAt(
  page: Page,
  world: { x: number; y: number; z: number },
): Promise<void> {
  const point = screenPointOf(await canvasRect(page), world);
  await page.mouse.dblclick(point.x, point.y);
  await page.waitForTimeout(120);
}

/** How many references are currently selected, read from the on-screen readout. */
export async function selectionCount(page: Page): Promise<number> {
  const list = page.locator('.selection');
  if ((await list.count()) === 0) return 0;
  return Number(await list.getAttribute('data-count'));
}

/** Every document key currently in OPFS, read from inside the page. */
export async function opfsKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const found: string[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, path: string): Promise<void> => {
      // @ts-expect-error entries() is not in every TS DOM lib yet
      for await (const [name, handle] of dir.entries()) {
        const full = path === '' ? name : `${path}/${name}`;
        if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, full);
        else found.push(full);
      }
    };
    await walk(await navigator.storage.getDirectory(), '');
    return found.sort();
  });
}

/**
 * Puts the app on the alpha channel before it starts, with a test invitation. Community, plugins,
 * collaboration, wiki editing and custom servers are alpha-only; the app defaults to stable.
 */
export async function onAlpha(page: Page, expires = 0): Promise<void> {
  const code = testInviteCode(expires);
  await withTestKey(page);
  await page.addInitScript((code) => {
    if (window !== window.top) return;
    try {
      localStorage.setItem('bezier.invite', code);
      localStorage.setItem('bezier.channel', 'alpha');
    } catch {
      // No storage: nothing to set.
    }
  }, code);
}

/** Lets the development server check invitation codes made with the tests' own key. */
export async function withTestKey(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    // Init scripts run in every frame; a plugin's sandboxed frame has no storage.
    if (window !== window.top) return;
    (window as { __bezierInviteKey?: string }).__bezierInviteKey = key;
  }, TEST_INVITE_PUBLIC_KEY);
}

/** Puts the app on the beta channel before it starts. Nothing is held back in beta yet. */
export async function onBeta(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    try {
      localStorage.setItem('bezier.channel', 'beta');
    } catch {
      // No storage: nothing to set.
    }
  });
}

/**
 * Where the app shows messages: Nib's island at the top while he is on (the default), otherwise a
 * toast. Match on text, not visibility; the island element itself has zero size.
 */
export function said(page: Page) {
  return page.locator('.nib-island, .toast');
}

/** Asserts the app said `text`. Nib shows only a message's title, so a compact line is expanded. */
export async function expectSaid(page: Page, text: string): Promise<void> {
  const island = page.locator('.nib-island');
  await expect
    .poll(async () => {
      if ((await page.locator('.toast', { hasText: text }).count()) > 0) return true;
      if (((await island.textContent()) ?? '').includes(text)) return true;
      if ((await island.getAttribute('data-shape')) === 'compact')
        await island.locator('.nib-island__line').click();
      return false;
    })
    .toBe(true);
}
