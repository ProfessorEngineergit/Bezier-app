/**
 * A hovered curved edge lights all the way round. The outline is an instanced line, and three.js
 * fixes an instanced geometry's segment count at its first upload, so an outline reusing the
 * geometry after a shorter one is truncated. Hovers a straight edge (one segment) first, then the
 * rim of a round boss, which must be lit along its whole length.
 */

import type { Page } from '@playwright/test';
import { canvasRect, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

interface Hook {
  pick(x: number, y: number): { point: { x: number; y: number; z: number } } | null;
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  showCameraView(view: unknown): void;
}

const hook = (page: Page) =>
  page.evaluateHandle(() => (window as unknown as { __bezierViewport: Hook }).__bezierViewport);

async function at(page: Page, fx: number, fy: number) {
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy);
}

async function finish(page: Page) {
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

/** A block with a round boss, seen from above. */
async function bossOnBlock(page: Page) {
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  await page.keyboard.press('r');
  await at(page, 0.35, 0.35);
  await at(page, 0.65, 0.65);
  await page.keyboard.press('Escape');
  await finish(page);
  await at(page, 0.5, 0.5);
  const field = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await field.fill('10');
  await field.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await railButton(page, 'Sketch').click();
  await railButton(page, 'Finish Sketch').click();
  await at(page, 0.5, 0.5);
  await railButton(page, 'Sketch').click();
  // The sketch is on the block's top, not a new one on the ground, before the circle is drawn.
  await expect(
    page.locator('.rail--left .rail__label', { hasText: 'Finish Sketch' }).locator('.rail__detail'),
  ).toHaveText('On a face');
  await page.keyboard.press('c');
  await at(page, 0.5, 0.5);
  await at(page, 0.55, 0.5);
  await page.keyboard.press('Escape');
  await finish(page);
  await at(page, 0.5, 0.5);
  await page.waitForTimeout(800);
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('Escape');
}

/** Which of `points` (canvas pixels) show the selection colour, as a string of # and . */
async function lit(page: Page, points: readonly ({ x: number; y: number } | null)[]) {
  const rect = await canvasRect(page);
  const shot = await page.screenshot();
  return page.evaluate(
    async ({ data, points, rx, ry }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context === null) return '';
      context.drawImage(image, 0, 0);
      return points
        .map((p) => {
          if (p === null) return '?';
          const px = context.getImageData(Math.round(rx + p.x) - 2, Math.round(ry + p.y) - 2, 5, 5);
          for (let i = 0; i < px.data.length; i += 4) {
            const [r, g, b] = [px.data[i] ?? 0, px.data[i + 1] ?? 0, px.data[i + 2] ?? 0];
            if (r < 140 && g > 140 && b > 190) return '#';
          }
          return '.';
        })
        .join('');
    },
    { data: shot.toString('base64'), points, rx: rect.x, ry: rect.y },
  );
}

test('the rim of a round boss lights all the way round, after a straight edge was hovered', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await bossOnBlock(page);
  const rect = await canvasRect(page);
  const viewport = await hook(page);
  // Locate the boss: its top under the view centre, its radius where the top ends.
  const top = await viewport.evaluate((v, { w, h }) => v.pick(w / 2, h / 2)?.point ?? null, {
    w: rect.width,
    h: rect.height,
  });
  expect(top).not.toBeNull();
  if (top === null) return;
  let radius = 0;
  for (let dx = 4; dx < rect.width * 0.1; dx += 1) {
    const p = await viewport.evaluate((v, { x, y }) => v.pick(x, y)?.point ?? null, {
      x: rect.width / 2 + dx,
      y: rect.height / 2,
    });
    if (p === null || Math.abs(p.z - top.z) > 1e-3) break;
    radius = Math.hypot(p.x - top.x, p.y - top.y);
  }
  expect(radius).toBeGreaterThan(5);
  // From above and to the side, the whole top rim is in view.
  await viewport.evaluate(
    (v, { top, r }) =>
      v.showCameraView({
        position: [top.x + 4 * r, top.y - 4 * r, top.z + 3 * r],
        target: [top.x, top.y, top.z - 4],
        parallel: false,
        zoom: 1,
      }),
    { top, r: radius },
  );
  await page.waitForTimeout(600);
  const ring = await viewport.evaluate(
    (v, { top, r }) =>
      Array.from({ length: 72 }, (_, i) => {
        const t = (i * 5 * Math.PI) / 180;
        return v.project(top.x + r * Math.cos(t), top.y + r * Math.sin(t), top.z);
      }),
    { top, r: radius },
  );
  // First a straight block edge: a one-segment outline.
  const corner = await viewport.evaluate(
    (v, { top, r }) => v.project(top.x + 3 * r, top.y, top.z - 8),
    {
      top,
      r: radius,
    },
  );
  if (corner !== null) {
    await page.mouse.move(rect.x + corner.x, rect.y + corner.y);
    await page.waitForTimeout(300);
  }
  // Then the front of the rim.
  const front = ring[54];
  expect(front).toBeTruthy();
  if (!front) return;
  await page.mouse.move(rect.x + front.x, rect.y + front.y);
  await page.waitForTimeout(500);
  const along = await lit(page, ring);
  expect([...along].filter((c) => c === '#').length).toBeGreaterThan(ring.length * 0.9);
});
