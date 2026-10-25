/**
 * Zooming at a wall does not stall in front of it. Each wheel step covers a share of the distance
 * to the surface under the cursor, so without a floor the eye approaches asymptotically; near the
 * wall a step carries through it, and zooming out from it moves at a usable pace.
 */

import type { Page } from '@playwright/test';
import { addBox, canvasRect, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

interface Hook {
  showCameraView(view: unknown): void;
  cameraPosition(): { x: number; y: number; z: number };
}

async function eye(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __bezierViewport: Hook }).__bezierViewport.cameraPosition(),
  );
}

async function wheel(page: Page, notches: number, delta: number) {
  for (let i = 0; i < notches; i++) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(400);
}

test('zooming at a wall goes through it, and zooming out comes away from it', async ({ page }) => {
  // One wheel step at a time, 130 in all.
  test.setTimeout(150_000);
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await addBox(page);
  // Square on to the box's front face (y = 0), 60 mm in front of it.
  await page.evaluate(() =>
    (window as unknown as { __bezierViewport: Hook }).__bezierViewport.showCameraView({
      position: [20, -60, 7.5],
      target: [20, 0, 7.5],
      parallel: false,
      zoom: 1,
    }),
  );
  await page.waitForTimeout(400);
  const rect = await canvasRect(page);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  // After ninety steps the eye is through the front face, inside the box or past it.
  await wheel(page, 90, -100);
  const inside = await eye(page);
  expect(inside.y).toBeGreaterThan(0);
  // Forty steps out take it well clear of the face.
  await page.evaluate(() =>
    (window as unknown as { __bezierViewport: Hook }).__bezierViewport.showCameraView({
      position: [20, -0.05, 7.5],
      target: [20, 0, 7.5],
      parallel: false,
      zoom: 1,
    }),
  );
  await page.waitForTimeout(300);
  await wheel(page, 40, 100);
  const away = await eye(page);
  expect(away.y).toBeLessThan(-5);
});
