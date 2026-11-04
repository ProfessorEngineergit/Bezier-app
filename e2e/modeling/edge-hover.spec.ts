/**
 * A hovered curved edge lights all the way round. The outline is an instanced line, and three.js
 * fixes an instanced geometry's segment count at its first upload, so an outline reusing the
 * geometry after a shorter one is truncated. Hovers a straight edge (one segment) first, then the
 * rim of a round boss, which must be lit along its whole length.
 */

import type { Page } from '@playwright/test';
import { addBox, canvasRect, openApp, railButton } from '../app.js';
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
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
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
      // The picture has device pixels, the points CSS pixels (WebKit's device runs at 2x).
      const scale = image.width / window.innerWidth;
      return points
        .map((p) => {
          if (p === null) return '?';
          const px = context.getImageData(
            Math.round((rx + p.x) * scale) - 2,
            Math.round((ry + p.y) * scale) - 2,
            5,
            5,
          );
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

/** The middle of the boss's top under the view centre, and its radius, from where the top ends. */
async function locateBoss(page: Page) {
  const rect = await canvasRect(page);
  const viewport = await hook(page);
  const top = await viewport.evaluate((v, { w, h }) => v.pick(w / 2, h / 2)?.point ?? null, {
    w: rect.width,
    h: rect.height,
  });
  if (top === null) throw new Error('nothing under the view centre');
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
  return { top, radius };
}

test('the rim of a round boss lights all the way round, after a straight edge was hovered', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await bossOnBlock(page);
  const rect = await canvasRect(page);
  const viewport = await hook(page);
  const { top, radius } = await locateBoss(page);
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

test('a hovered face reads whole: the part of it behind the boss shows through', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await bossOnBlock(page);
  const rect = await canvasRect(page);
  const viewport = await hook(page);
  const { top, radius } = await locateBoss(page);
  const block = top.z - 8;
  // Low over the block, so the boss stands in front of the far part of its top.
  await viewport.evaluate(
    (v, { top, block }) =>
      v.showCameraView({
        position: [top.x, top.y - 120, block + 40],
        target: [top.x, top.y, block],
        parallel: false,
        zoom: 1,
      }),
    { top, block },
  );
  await page.mouse.move(rect.x + 2, rect.y + 2);
  await page.waitForTimeout(600);
  // Behind the boss: the block's top, hidden by it.
  const hidden = await viewport.evaluate((v, { x, y, z }) => v.project(x, y, z), {
    x: top.x,
    y: top.y + radius + 3,
    z: block,
  });
  // Beside the boss: the same face, in plain view.
  const inView = await viewport.evaluate((v, { x, y, z }) => v.project(x, y, z), {
    x: top.x + radius + 10,
    y: top.y - 12,
    z: block,
  });
  expect(hidden).not.toBeNull();
  expect(inView).not.toBeNull();
  if (hidden === null || inView === null) return;
  const over = await viewport.evaluate((v, p) => v.pick(p.x, p.y)?.point ?? null, hidden);
  expect(Math.abs((over?.z ?? block) - block)).toBeGreaterThan(0.5);
  const under = await viewport.evaluate((v, p) => v.pick(p.x, p.y)?.point ?? null, inView);
  expect(Math.abs((under?.z ?? 0) - block)).toBeLessThan(1e-3);
  const clip = { x: rect.x + hidden.x - 3, y: rect.y + hidden.y - 3, width: 6, height: 6 };
  const before = await page.screenshot({ clip });
  await page.mouse.move(rect.x + inView.x, rect.y + inView.y);
  await expect
    .poll(() => page.screenshot({ clip }).then((after) => after.equals(before)))
    .toBe(false);
});

test('turning the view with a button held picks nothing and lets the highlight go', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await bossOnBlock(page);
  const rect = await canvasRect(page);
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.evaluate(() => {
    const scene = (
      window as unknown as { __bezierViewport: { pick: (...args: unknown[]) => unknown } }
    ).__bezierViewport;
    const pick = scene.pick.bind(scene);
    (window as unknown as { __picks: number }).__picks = 0;
    scene.pick = (...args) => {
      (window as unknown as { __picks: number }).__picks += 1;
      return pick(...args);
    };
  });
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5, { steps: 12 });
  const picks = await page.evaluate(() => (window as unknown as { __picks: number }).__picks);
  await page.mouse.up({ button: 'right' });
  expect(picks).toBe(0);
});

test('leaving the model for a panel lets the highlight go', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const rect = await canvasRect(page);
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await expect(page.locator('canvas.viewport')).toHaveAttribute('data-hover', /.+/);
  await page.mouse.move(rect.x + 2, 10);
  await expect(page.locator('canvas.viewport')).not.toHaveAttribute('data-hover', /.+/);
});
