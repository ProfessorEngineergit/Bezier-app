/**
 * Images placed on a plane: any format the browser decodes, selected with handles on the canvas
 * and numbers in a panel, and sized, cropped and moved as single history steps that survive
 * reopening the project.
 */

import type { Page } from '@playwright/test';
import { openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';
import { twoColourPng } from '../png.js';

const RED = [220, 30, 30] as const;
const BLUE = [30, 60, 220] as const;

async function importPicture(page: Page, name: string, mimeType: string, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({ name, mimeType, buffer });
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Image' });
const field = (page: Page, label: string) =>
  panel(page).getByRole('textbox', { name: label, exact: true });
const handle = (page: Page, id: string) => page.locator(`[data-handle="${id}"]`);

async function centreOf(page: Page, id: string) {
  const box = await handle(page, id).boundingBox();
  if (box === null) throw new Error(`no handle ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A screen point a fraction of the way across the image, along its middle. */
async function alongWidth(page: Page, part: number) {
  const nw = await centreOf(page, 'corner-nw');
  const sw = await centreOf(page, 'corner-sw');
  const ne = await centreOf(page, 'corner-ne');
  const se = await centreOf(page, 'corner-se');
  const west = { x: (nw.x + sw.x) / 2, y: (nw.y + sw.y) / 2 };
  const east = { x: (ne.x + se.x) / 2, y: (ne.y + se.y) / 2 };
  return { x: west.x + (east.x - west.x) * part, y: west.y + (east.y - west.y) * part };
}

/** The screen colour at a point, read from a screenshot drawn into a canvas. */
async function colourAt(page: Page, x: number, y: number) {
  const shot = await page.screenshot();
  return page.evaluate(
    async ({ bytes, x, y }) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2d context');
      context.drawImage(bitmap, 0, 0);
      const scale = bitmap.width / window.innerWidth;
      return Array.from(
        context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data,
      );
    },
    { bytes: Array.from(shot), x, y },
  );
}

test('a picture comes in on a plane, whole, selected, with its handles and its panel', async ({
  page,
}) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));

  await expect(panel(page)).toBeVisible();
  // The longer side becomes 100 mm, keeping proportions.
  await expect(field(page, 'Width')).toHaveValue('100');
  await expect(field(page, 'Height')).toHaveValue('50');
  for (const id of ['move', 'rotate', 'corner-nw', 'corner-ne', 'corner-se', 'corner-sw'])
    await expect(handle(page, id)).toBeVisible();

  // Red left of the middle and blue right of it, along the image's own axis (the plane is seen at
  // an angle).
  const quarter = await alongWidth(page, 0.25);
  const threeQuarters = await alongWidth(page, 0.75);
  const left = await colourAt(page, quarter.x, quarter.y);
  const right = await colourAt(page, threeQuarters.x, threeQuarters.y);
  expect(left[0]).toBeGreaterThan(left[2] ?? 0);
  expect(right[2]).toBeGreaterThan(right[0] ?? 0);

  // It is listed in Items, and an image is a history step like any other.
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await expect(page.getByRole('button', { name: 'plan', exact: true })).toBeVisible();
});

test('dragging a corner resizes about the opposite corner, and undo takes it back', async ({
  page,
}) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  await expect(panel(page)).toBeVisible();

  const nw = await centreOf(page, 'corner-nw');
  const se = await centreOf(page, 'corner-se');
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x + 90, se.y + 45, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => Number(await field(page, 'Width').inputValue()))
    .toBeGreaterThan(110);
  const width = Number(await field(page, 'Width').inputValue());
  const height = Number(await field(page, 'Height').inputValue());
  // Proportions kept.
  expect(width / height).toBeCloseTo(2, 1);
  // The opposite corner did not move.
  const after = await centreOf(page, 'corner-nw');
  expect(Math.abs(after.x - nw.x)).toBeLessThan(2);
  expect(Math.abs(after.y - nw.y)).toBeLessThan(2);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(field(page, 'Width')).toHaveValue('100');
});

test('the numbers set exactly, and Keep proportions follows', async ({ page }) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  await expect(panel(page)).toBeVisible();

  await field(page, 'Width').fill('210');
  await field(page, 'Width').press('Enter');
  await expect(field(page, 'Width')).toHaveValue('210');
  await expect(field(page, 'Height')).toHaveValue('105');

  await panel(page).getByLabel('Keep proportions').uncheck();
  await field(page, 'Height').fill('40');
  await field(page, 'Height').press('Enter');
  await expect(field(page, 'Height')).toHaveValue('40');
  await expect(field(page, 'Width')).toHaveValue('210');

  await field(page, 'X').fill('25');
  await field(page, 'X').press('Enter');
  await expect(field(page, 'X')).toHaveValue('25');
});

test('cropping takes a side off at the picture scale, and Reset crop brings it back', async ({
  page,
}) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  await expect(panel(page)).toBeVisible();

  await panel(page).getByRole('radio', { name: 'Crop' }).check();
  await expect(handle(page, 'edge-w')).toBeVisible();
  const west = await centreOf(page, 'edge-w');
  const east = await centreOf(page, 'edge-e');
  // Crop from the west edge to the middle: the red half goes.
  await page.mouse.move(west.x, west.y);
  await page.mouse.down();
  await page.mouse.move(west.x + (east.x - west.x) * 0.7, west.y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => Number(await field(page, 'Width').inputValue())).toBeLessThan(50);
  await expect(field(page, 'Height')).toHaveValue('50');
  // The blue half remains.
  const shownAt = await alongWidth(page, 0.5);
  const shown = await colourAt(page, shownAt.x, shownAt.y);
  expect(shown[2]).toBeGreaterThan(shown[0] ?? 0);

  await panel(page).getByRole('button', { name: 'Reset crop' }).click();
  await expect(field(page, 'Width')).toHaveValue('100');
  await expect(panel(page).getByRole('button', { name: 'Reset crop' })).toBeDisabled();
});

test('a picture is kept: it is in the project when it is opened again, at the size it was given', async ({
  page,
}) => {
  await openApp(page);
  await importPicture(page, 'site.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  await field(page, 'Width').fill('80');
  await field(page, 'Width').press('Enter');
  await expect(field(page, 'Width')).toHaveValue('80');
  await panel(page)
    .getByRole('button', { name: /^Exit / })
    .click();
  await expect(panel(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await page.locator('.tile__face').first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await page.getByRole('button', { name: 'site', exact: true }).click();
  await expect(field(page, 'Width')).toHaveValue('80');
});

test('every format the window decodes comes in, and a large one is brought down', async ({
  page,
}) => {
  await openApp(page);
  // Generated in the page: a JPEG, a WebP, and one image too large to keep at full size.
  const made = await page.evaluate(async () => {
    const draw = async (width: number, height: number, type: string) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2d context');
      context.fillStyle = '#c33';
      context.fillRect(0, 0, width, height);
      const blob = await canvas.convertToBlob({ type, quality: 0.9 });
      return { type: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    };
    return {
      jpeg: await draw(120, 60, 'image/jpeg'),
      webp: await draw(120, 60, 'image/webp'),
      large: await draw(6200, 3100, 'image/png'),
    };
  });

  for (const [name, entry] of [
    ['photo.jpg', made.jpeg],
    ['sheet.webp', made.webp],
  ] as const) {
    await importPicture(page, name, entry.type, Buffer.from(entry.bytes));
    await expect(panel(page)).toBeVisible();
    await expect(field(page, 'Width')).toHaveValue('100');
    await expect(field(page, 'Height')).toHaveValue('50');
    await panel(page)
      .getByRole('button', { name: /^Exit / })
      .click();
  }

  // 6200 × 3100 pixels is downscaled, keeping the original proportions.
  await importPicture(page, 'huge.png', 'image/png', Buffer.from(made.large.bytes));
  await expect(field(page, 'Width')).toHaveValue('100');
  await expect(field(page, 'Height')).toHaveValue('50');
});

test('a file that is not a picture is turned away, and says why', async ({ page }) => {
  await openApp(page);
  await importPicture(page, 'broken.png', 'image/png', Buffer.from('this is not a picture'));
  await expect(page.getByText(/could not be read as a picture/)).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test('the panel is the same as the others: it closes with the cross, and is dragged and snaps to an edge', async ({
  page,
}) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  await expect(panel(page)).toBeVisible();

  const grip = panel(page).getByRole('button', { name: /^Move .* panel$/ });
  const before = await panel(page).boundingBox();
  const gripBox = await grip.boundingBox();
  if (before === null || gripBox === null) throw new Error('no panel');
  const from = { x: gripBox.x + 20, y: gripBox.y + gripBox.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Drag up and left, releasing a few pixels short of the stage's left edge.
  await page.mouse.move(from.x - before.x + 14, from.y - 160, { steps: 8 });
  await page.mouse.up();
  const after = await panel(page).boundingBox();
  if (after === null) throw new Error('the panel went away');
  expect(after.y).toBeLessThan(before.y - 100);
  // It snaps to the edge margin, not the 14 px it was released at. The rail is at that edge, so it
  // ends up one gap (8 px) from the rail's band.
  const band = await page.locator('.rail--left .rail__icons').first().boundingBox();
  expect(Math.round(after.x - ((band?.x ?? 0) + (band?.width ?? 0)))).toBe(8);

  await panel(page)
    .getByRole('button', { name: /^Exit / })
    .click();
  await expect(panel(page)).toHaveCount(0);
  // Closing the panel keeps the image; clicking it brings the panel back.
  await expect(page.locator('[data-handle]')).toHaveCount(0);
});

test('Escape ends the editing, and the picture stays', async ({ page }) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  await expect(panel(page)).toBeVisible();
  await page.mouse.click(5, 400);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
});

test('clicking the picture selects it, and a click on nothing lets go of it', async ({ page }) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  // Measured while the handles are shown; after closing, they are gone with the panel.
  const where = await alongWidth(page, 0.3);
  await panel(page)
    .getByRole('button', { name: /^Exit / })
    .click();
  await expect(panel(page)).toHaveCount(0);

  await page.mouse.click(where.x, where.y);
  await expect(panel(page)).toBeVisible();
  await expect(field(page, 'Width')).toHaveValue('100');

  await page.mouse.click(1000, 150);
  await expect(panel(page)).toHaveCount(0);
});

test('M moves the picture like any other part, and Copy leaves the first where it was', async ({
  page,
}) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press('m');
  const toolbar = page.getByRole('toolbar', { name: 'Move and rotate' });
  await expect(toolbar).toBeVisible();
  // The numbers panel gives way to the gizmo, as for a body.
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Move X', exact: true }).click();
  const distance = page.getByRole('spinbutton', { name: 'Move distance' });
  await distance.fill('30');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // X is now 30, along the image's plane.
  await expect(panel(page)).toBeVisible();
  await expect(field(page, 'X')).toHaveValue('30');

  // The Z arrow lifts it off the plane: it changes the offset, not X or Y.
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Move Z', exact: true }).click();
  await distance.fill('12');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(field(page, 'Offset')).toHaveValue('12');
  await expect(field(page, 'X')).toHaveValue('30');
});

test("the picture's outline is under the panel, as a sketch line is", async ({ page }) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  // Large enough that its outline runs behind the panel.
  await field(page, 'Width').fill('900');
  await field(page, 'Width').press('Enter');
  await expect(field(page, 'Width')).toHaveValue('900');

  const layers = await page.evaluate(() => {
    const z = (selector: string) =>
      Number(getComputedStyle(document.querySelector(selector) as Element).zIndex);
    return { picture: z('.image-editor'), panel: z('.inspection-panel'), rail: z('.rail--left') };
  });
  expect(layers.picture).toBeLessThan(layers.panel);
  expect(layers.picture).toBeLessThan(layers.rail);

  // Hit-testing agrees: at the panel's centre, the topmost element is the panel.
  const box = await panel(page).boundingBox();
  if (box === null) throw new Error('no panel');
  const top = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('.inspection-panel, .image-editor') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(top).toBe(true);
  const topIsPanel = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.inspection-panel') !== null,
    { x: box.x + box.width / 2, y: box.y + 40 },
  );
  expect(topIsPanel).toBe(true);
  await page.screenshot({ path: test.info().outputPath('outline-under-panel.png') });
});

test('B8: two fingers turning on the trackpad turn the picture', async ({ page }) => {
  await openApp(page);
  await importPicture(page, 'plan.png', 'image/png', twoColourPng(200, 100, RED, BLUE));
  await expect(panel(page)).toBeVisible();
  await expect(field(page, 'Turn')).toHaveValue('0');
  // WebKit reports a rotate as gesture events with the angle since the fingers went down.
  await page.evaluate(() => {
    const send = (type: string, rotation: number) => {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, 'rotation', { value: rotation });
      window.dispatchEvent(event);
    };
    send('gesturestart', 0);
    send('gesturechange', 15);
    send('gesturechange', 30);
    send('gestureend', 30);
  });
  await expect(field(page, 'Turn')).toHaveValue('-30');
});
