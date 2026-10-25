/**
 * Per-face materials in Visualize: the hovered face highlights, a click picks it, a chosen material
 * applies to that face only, and a double click picks the whole body, whose material then changes
 * everything except faces with their own.
 */

import type { Page } from '@playwright/test';
import { addBox, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

const render = (page: Page) => page.getByLabel('PBR presentation viewport');

/** Box face positions in the initial render, as fractions of it. */
const FRONT = [0.46, 0.6] as const;
const TOP = [0.42, 0.36] as const;

async function at(page: Page, [fx, fy]: readonly [number, number]) {
  const box = await render(page).boundingBox();
  if (box === null) throw new Error('no render');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** The render colour around a point, averaged over a few pixels, with the pointer moved away. */
async function colourAt(page: Page, where: readonly [number, number]) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(700);
  const { x, y } = await at(page, where);
  const shot = await page.screenshot({ clip: { x: x - 3, y: y - 3, width: 7, height: 7 } });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) return { r: 0, g: 0, b: 0 };
    context.drawImage(image, 0, 0);
    const px = context.getImageData(0, 0, image.width, image.height).data;
    let [r, g, b, n] = [0, 0, 0, 0];
    for (let i = 0; i < px.length; i += 4) {
      r += px[i] ?? 0;
      g += px[i + 1] ?? 0;
      b += px[i + 2] ?? 0;
      n += 1;
    }
    return { r: r / n, g: g / n, b: b / n };
  }, shot.toString('base64'));
}

const reddish = (c: { r: number; g: number; b: number }) => c.r > c.g + 30 && c.r > c.b + 30;
const bluish = (c: { r: number; g: number; b: number }) => c.b > c.r + 30;

async function tint(page: Page, hex: string) {
  const field = page.getByLabel('Material hex colour');
  await field.fill(hex);
  await field.blur();
}

test('a face takes a material of its own, which the body’s material then leaves alone', async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 600_000 : 300_000);
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  await expect(render(page)).toHaveAttribute('aria-busy', 'false', { timeout: 240_000 });
  const look = page.getByRole('complementary', { name: 'Look' });
  await expect(look).toContainText('Apply to: All visible bodies');

  // A click on the front face picks it, and the material goes to it alone.
  const front = await at(page, FRONT);
  await page.mouse.click(front.x, front.y);
  await expect(look).toContainText('Apply to: 1 face of Body 1');
  await expect(look.getByRole('button', { name: "Use the body's material" })).toBeDisabled();
  await tint(page, '#E5484D');
  await expect(look.getByRole('button', { name: "Use the body's material" })).toBeEnabled();
  expect(reddish(await colourAt(page, FRONT))).toBe(true);
  expect(reddish(await colourAt(page, TOP))).toBe(false);

  // A double click picks the whole body: blue goes everywhere except the red face.
  const top = await at(page, TOP);
  await page.mouse.dblclick(top.x, top.y);
  await expect(look).toContainText('Apply to: Body 1');
  await tint(page, '#2F6FE0');
  expect(bluish(await colourAt(page, TOP))).toBe(true);
  expect(reddish(await colourAt(page, FRONT))).toBe(true);

  // The face, picked again, shows its own material; once reset it takes the body's blue.
  await page.mouse.click(front.x, front.y);
  await expect(look).toContainText('Apply to: 1 face of Body 1');
  await expect(page.getByLabel('Material hex colour')).toHaveValue('#E5484D');
  await look.getByRole('button', { name: "Use the body's material" }).click();
  await expect(page.getByLabel('Material hex colour')).toHaveValue('#2F6FE0');
  // Deselect the face (click the empty backdrop) so its highlight does not hide the colour.
  await page.mouse.click(5, (await at(page, [0.5, 0.95])).y);
  expect(bluish(await colourAt(page, FRONT))).toBe(true);
});
