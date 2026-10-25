/**
 * How the views react when the graphics underneath change: a lost and restored context, and a
 * display scale change. Both are simulated in Chromium on software WebGL, not with a real driver
 * reset or second monitor; the tests cover the app's response to the events the browser sends.
 */

import type { Page } from '@playwright/test';
import { addBox, afterFrames, openApp } from '../app.js';
import { test as base, expect } from '../fixtures.js';
import { twoColourPng } from '../png.js';

/** The test causes the context loss, which three logs as an error; other errors still fail. */
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !/Device Lost/.test(message.text()))
          errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
      await use(errors);
      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

const PRESENTATION = 'canvas[aria-label="PBR presentation viewport"]';

/** Counts the draw calls a canvas's WebGL2 context makes from now on. */
async function countDraws(page: Page): Promise<void> {
  await page.locator(PRESENTATION).evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2');
    if (gl === null) throw new Error('No WebGL2 context on the presentation canvas');
    const audit = { draws: 0, canvas, gl };
    for (const name of [
      'drawElements',
      'drawArrays',
      'drawElementsInstanced',
      'drawArraysInstanced',
    ] as const) {
      const original = gl[name].bind(gl) as (...args: unknown[]) => void;
      (gl as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        audit.draws++;
        original(...args);
      };
    }
    (window as unknown as { __draws: typeof audit }).__draws = audit;
  });
}

const draws = (page: Page) =>
  page.evaluate(() => (window as unknown as { __draws: { draws: number } }).__draws.draws);

async function orbit(page: Page): Promise<void> {
  const box = await page.locator(PRESENTATION).boundingBox();
  if (box === null) throw new Error('No presentation canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await afterFrames(page);
}

test('Visualize draws the model again after its context is lost and given back', async ({
  page,
  browserName,
}) => {
  // WebKit uses WebGPU for Visualize, and a page cannot force a WebGPU device loss. Both share
  // the handling (three's onDeviceLost).
  test.skip(browserName !== 'chromium', 'The loss is caused through WEBGL_lose_context');
  test.setTimeout(240_000);
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  const presentation = page.locator(PRESENTATION);
  await expect(presentation).toHaveAttribute('aria-busy', 'false', { timeout: 120_000 });
  // A decal is part of the look and must come back too.
  await page.locator('.viz-decal input[type="file"]').setInputFiles({
    name: 'mark.png',
    mimeType: 'image/png',
    buffer: twoColourPng(32, 32, [230, 40, 40], [40, 40, 230]),
  });
  await expect(page.getByRole('button', { name: 'Clear 1', exact: true })).toBeVisible();
  await countDraws(page);
  await orbit(page);
  expect(await draws(page), 'drawing before the loss').toBeGreaterThan(0);

  // Lose and restore the context, as a driver reset does. Only the loss is awaited: the app
  // replaces the canvas, so the restored one is no longer drawn on.
  await page.evaluate(async () => {
    const { canvas, gl } = (
      window as unknown as { __draws: { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext } }
    ).__draws;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose === null) throw new Error('No WEBGL_lose_context');
    const lost = new Promise((resolve) => canvas.addEventListener('webglcontextlost', resolve));
    lose.loseContext();
    await lost;
    try {
      lose.restoreContext();
    } catch {
      // The browser may refuse to restore a context the app has abandoned.
    }
  });

  // A fresh renderer on a new canvas, holding the model and drawing it.
  await expect(presentation).toHaveAttribute('aria-busy', 'false', { timeout: 120_000 });
  expect(
    await presentation.evaluate(
      (canvas) =>
        canvas !== (window as unknown as { __draws: { canvas: HTMLCanvasElement } }).__draws.canvas,
    ),
    'a new canvas',
  ).toBe(true);
  await countDraws(page);
  await orbit(page);
  expect(await draws(page), 'drawing after the loss').toBeGreaterThan(0);
  await presentation.screenshot({ path: test.info().outputPath('visualize-after-loss.png') });
  await expect(page.getByRole('button', { name: 'Clear 1', exact: true })).toBeVisible();
  await expect(page.getByText('could not be put back')).toHaveCount(0);
  await expect(page.getByText('The graphics device was lost several times')).toHaveCount(0);
});

test('the modeling view takes the new density when the display scale changes', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'The scale is changed through the Chrome DevTools Protocol',
  );
  await openApp(page);
  await addBox(page);
  const buffer = () =>
    page
      .locator('canvas.viewport')
      .evaluate((canvas: HTMLCanvasElement) => canvas.width / canvas.clientWidth);
  expect(await buffer()).toBeCloseTo(1, 1);
  const cdp = await context.newCDPSession(page);
  // The scale change comes with a one-pixel size change: Chromium's emulation fires no resolution
  // media query change when the size stays the same. A real monitor move does not rely on this.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 801,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
  await expect.poll(buffer).toBeCloseTo(2, 1);
  // And back, as when the window returns to the first monitor.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(1);
  await expect.poll(buffer).toBeCloseTo(1, 1);
});
