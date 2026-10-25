/** Shared helpers for the help states: canvas positions as fractions, and common setups. */

import type { Locator, Page } from '@playwright/test';
import { addBox, canvasRect, commitExtrude, openApp, railButton } from '../../app.js';
import { expect, test } from '../../fixtures.js';
import type { Box } from './frame.js';

/** Clicks a canvas position given as fractions of its width and height. */
export async function at(page: Page, fx: number, fy: number): Promise<void> {
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
}

export async function squareTop(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Top', exact: true }).click();
}

/** Enters a sketch on the plane facing the camera, looking straight down. */
export async function sketching(page: Page): Promise<void> {
  await squareTop(page);
  await railButton(page, 'Sketch').click();
}

/** Leaves the sketch. */
export async function finish(page: Page): Promise<void> {
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

/** Draws a rectangle with two clicks, then drops the tool. */
export async function rectangleAt(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number],
): Promise<void> {
  await page.keyboard.press('r');
  await at(page, ...from);
  await at(page, ...to);
  await page.keyboard.press('Escape');
}

/** Two joined lines, as in the constraints tests. */
export async function twoLines(
  page: Page,
): Promise<{ first: () => Promise<void>; second: () => Promise<void> }> {
  await sketching(page);
  await page.keyboard.press('l');
  await at(page, 0.4, 0.45);
  await at(page, 0.55, 0.45);
  await at(page, 0.6, 0.6);
  await page.keyboard.press('Escape');
  return {
    first: () => at(page, 0.47, 0.45),
    second: async () => {
      await page.keyboard.down('Shift');
      await at(page, 0.575, 0.525);
      await page.keyboard.up('Shift');
    },
  };
}

/** A canvas region as fractions of its size: what a picture must show of the model. */
export async function onCanvas(
  page: Page,
  fx1: number,
  fy1: number,
  fx2: number,
  fy2: number,
): Promise<Box> {
  const rect = await canvasRect(page);
  return {
    x: rect.x + rect.width * fx1,
    y: rect.y + rect.height * fy1,
    width: rect.width * (fx2 - fx1),
    height: rect.height * (fy2 - fy1),
  };
}

/** The box, with the Tools flyout closed again so the editor is at rest. */
export async function boxAtRest(page: Page): Promise<void> {
  await addBox(page);
  await railButton(page, 'Tools').click();
  await expect(railButton(page, 'Extrude')).toHaveCount(0);
}

/**
 * The editor as users see it: the fixtures enable the history list and reference readout, which
 * are developer settings. Pictures of Items or a selection must match the docs, so this turns them
 * off and reopens the project.
 */
export async function userView(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // A plugin's sandboxed frame has no storage.
    if (window !== window.top) return;
    const key = 'bezier.preferences';
    let stored: Record<string, unknown> = {};
    try {
      stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    } catch {
      stored = {};
    }
    const values = (stored.values as Record<string, unknown> | undefined) ?? stored;
    values.showHistory = false;
    values.showReferences = false;
    window.localStorage.setItem(key, JSON.stringify(stored.values ? stored : values));
  });
  await openApp(page);
}

let markers = 0;

/**
 * A non-element arrow target (a plane, part of a line, a face): an invisible box placed over the
 * spot, which the frame helper treats like any other target.
 */
export async function markAt(
  page: Page,
  x: number,
  y: number,
  width = 24,
  height = 24,
): Promise<Locator> {
  markers += 1;
  const id = `help-mark-${markers}`;
  await page.evaluate(
    ({ id: markId, left, top, w, h }) => {
      const element = document.createElement('div');
      element.id = markId;
      element.setAttribute('aria-hidden', 'true');
      element.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${w}px;height:${h}px;pointer-events:none;opacity:0;`;
      document.body.append(element);
    },
    { id, left: x - width / 2, top: y - height / 2, w: width, h: height },
  );
  return page.locator(`#${id}`);
}

/** A canvas position in page pixels, given as fractions of the canvas. */
export async function pixelAt(
  page: Page,
  fx: number,
  fy: number,
): Promise<{ x: number; y: number }> {
  const rect = await canvasRect(page);
  return { x: rect.x + rect.width * fx, y: rect.y + rect.height * fy };
}

/** Draws lines through the points and back to the first, closing the shape, then drops the tool. */
export async function polygon(
  page: Page,
  points: readonly (readonly [number, number])[],
): Promise<void> {
  await page.keyboard.press('l');
  for (const [x, y] of points) await at(page, x, y);
  const [first] = points;
  if (first !== undefined) await at(page, first[0], first[1]);
  await page.keyboard.press('Escape');
}

/** Draws a circle by centre and a point on it, then drops the tool. */
export async function circleAt(
  page: Page,
  centre: readonly [number, number],
  edge: readonly [number, number],
): Promise<void> {
  await page.keyboard.press('c');
  await at(page, ...centre);
  await at(page, ...edge);
  await page.keyboard.press('Escape');
}

/** Draws an exact-size rectangle as the docs describe: corner, length, Tab, width, Enter. */
export async function typedRectangle(
  page: Page,
  from: readonly [number, number],
  toward: readonly [number, number],
  length: string,
  width: string,
): Promise<void> {
  await page.keyboard.press('r');
  await at(page, ...from);
  const to = await pixelAt(page, ...toward);
  await page.mouse.move(to.x, to.y);
  await page.keyboard.type(length);
  await page.keyboard.press('Tab');
  await page.keyboard.type(width);
  await page.keyboard.press('Enter');
}

/** Clicks a finished area and types the distance, as an Extrude is made from a sketch. */
export async function pullUp(
  page: Page,
  inside: readonly [number, number],
  distance: string,
): Promise<void> {
  await at(page, ...inside);
  await commitExtrude(page, distance);
}

/** Renames the project in the top bar as the docs describe: click, type, Enter. */
export async function renameProject(page: Page, name: string): Promise<void> {
  // Retry if the still-opening project overwrote the new name; the field may still be open from the
  // previous attempt.
  await expect(async () => {
    const field = page.getByRole('textbox', { name: 'Project name' });
    if (!(await field.isVisible())) await page.locator('.titlebar__name').click({ timeout: 5_000 });
    await field.fill(name, { timeout: 5_000 });
    await field.press('Enter');
    await expect(page.locator('.titlebar__name')).toHaveText(name, { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
}

/** Goes back to the start page once its projects are loaded. */
export async function goHome(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
}

interface Part {
  name: string;
  draw: (page: Page) => Promise<void>;
  inside: readonly [number, number];
  distance: string;
}

/** The parts that fill the start page library: a small workshop. */
const PARTS: readonly Part[] = [
  {
    name: 'Mounting block',
    draw: async (page) => rectangleAt(page, [0.4, 0.4], [0.6, 0.6]),
    inside: [0.5, 0.5],
    distance: '20',
  },
  {
    name: 'Bracket',
    draw: async (page) =>
      polygon(page, [
        [0.4, 0.34],
        [0.62, 0.34],
        [0.62, 0.46],
        [0.5, 0.46],
        [0.5, 0.66],
        [0.4, 0.66],
      ]),
    inside: [0.44, 0.5],
    distance: '12',
  },
  {
    name: 'Shaft',
    draw: async (page) => circleAt(page, [0.5, 0.5], [0.56, 0.5]),
    inside: [0.5, 0.5],
    distance: '60',
  },
  {
    name: 'Grid plate',
    draw: async (page) => {
      await rectangleAt(page, [0.34, 0.4], [0.66, 0.6]);
      await circleAt(page, [0.42, 0.5], [0.45, 0.5]);
      await circleAt(page, [0.58, 0.5], [0.61, 0.5]);
    },
    inside: [0.5, 0.45],
    distance: '5',
  },
  {
    name: 'Spacer',
    draw: async (page) => {
      await circleAt(page, [0.5, 0.5], [0.58, 0.5]);
      await circleAt(page, [0.5, 0.5], [0.54, 0.5]);
    },
    inside: [0.56, 0.5],
    distance: '8',
  },
  {
    name: 'Enclosure frame',
    draw: async (page) => {
      await rectangleAt(page, [0.3, 0.36], [0.7, 0.64]);
      await rectangleAt(page, [0.33, 0.39], [0.67, 0.61]);
    },
    inside: [0.31, 0.5],
    distance: '10',
  },
];

/**
 * Fills the start page library. Run inside a freshly opened empty project: each part is made as
 * the docs describe (sketch, finish, click, distance), named and left via Home, so each card gets
 * its thumbnail. Two go into a folder.
 */
export async function fillLibrary(page: Page): Promise<void> {
  test.setTimeout(420_000);
  for (const [index, part] of PARTS.entries()) {
    if (index > 0) {
      await page.getByRole('button', { name: 'New Project' }).first().click();
      // The fourth project in a row opens slowly on a loaded machine.
      await expect(page.locator('canvas.viewport')).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('html[data-busy]')).toHaveCount(0, { timeout: 60_000 });
    }
    await sketching(page);
    await part.draw(page);
    await finish(page);
    await pullUp(page, part.inside, part.distance);
    await renameProject(page, part.name);
    await goHome(page);
    await expect(page.getByRole('button', { name: `Open ${part.name}` })).toBeVisible();
  }
  await page.locator('.library-sidebar__section > header button').first().click();
  const folder = page.locator('.library-folder').first();
  await expect(folder).toContainText('New Folder');
  await folder.locator('.library-folder__open').click();
  await page.getByRole('button', { name: 'More options for New Folder' }).click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  const name = page.getByRole('textbox', { name: 'Folder name' });
  await name.fill('Mounts');
  await name.press('Enter');
  await expect(folder).toContainText('Mounts');
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: /^All Projects/ })
    .click();
  for (const part of ['Bracket', 'Mounting block'])
    await page.locator('.tile', { hasText: part }).dragTo(folder);
  await expect(folder).toContainText('2');
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: /^All Projects/ })
    .click();
  await expect(page.locator('.tile')).toHaveCount(PARTS.length);
}

/** The starter box and a second body beside it. */
export async function twoBodies(page: Page): Promise<void> {
  await addBox(page);
  await railButton(page, 'Tools').click();
  await sketching(page);
  await circleAt(page, [0.1, 0.5], [0.14, 0.5]);
  await finish(page);
  await pullUp(page, [0.1, 0.5], '25');
  await page.keyboard.press('Control+1');
}

/**
 * The plate from "Sketching in five minutes", drawn but not finished: 60 by 40, typed, with a
 * 12 mm circle, its diameter typed too.
 */
export async function drawPlate(page: Page): Promise<void> {
  await sketching(page);
  await typedRectangle(page, [0.36, 0.64], [0.7, 0.3], '60', '40');
  await circleAt(page, [0.5, 0.5], [0.53, 0.5]);
  const diameter = page.getByRole('textbox', { name: /Diameter for sketch circle/ });
  await diameter.fill('12');
  await diameter.press('Enter');
}

/** The finished plate, from the starting view. */
export async function plate(page: Page): Promise<void> {
  await drawPlate(page);
  await finish(page);
  await pullUp(page, [0.4, 0.55], '8');
  await page.keyboard.press('Control+1');
}
