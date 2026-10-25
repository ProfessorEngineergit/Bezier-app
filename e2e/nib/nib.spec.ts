/**
 * Nib's head in the island. Without a GPU this checks that he always shows (image or live, never
 * empty) and that when switched off or with reduced motion none of his model is fetched.
 * `data-head="live"` only means the stage started, which happens with a GPU (WebKit on macOS) but
 * not in headless Chromium, where he stays an image.
 */

import type { Page } from '@playwright/test';
import { openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

const MODEL = /\/nib\/nib\.glb/;

/** Opens the app with these preference values and the first lesson not yet offered. */
async function open(page: Page, values: Record<string, unknown> = {}): Promise<string[]> {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.addInitScript((extra) => {
    if (window !== window.top) return;
    const key = 'bezier.preferences';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const prefs = (stored.values as Record<string, unknown> | undefined) ?? stored;
    Object.assign(prefs, extra);
    localStorage.setItem(key, JSON.stringify(stored.values ? stored : prefs));
    localStorage.setItem('bezier.nib', JSON.stringify({ met: false, guides: [] }));
    localStorage.setItem('bezier.nib.offered', '[]');
  }, values);
  await openApp(page);
  return requested;
}

const island = (page: Page) => page.locator('.nib-island');

test('the island opens with his head in it, a picture first and alive when the graphics allow', async ({
  page,
}) => {
  await open(page);
  await expect(island(page)).toHaveAttribute('data-shape', 'card', { timeout: 8000 });
  await expect(island(page).locator('.nib-island__head')).toHaveAttribute(
    'data-head',
    /^(live|picture|loading)$/,
  );
  // The flat face is always under the live one, so he is never missing.
  await expect(island(page).locator('.nib-island__head .nib-face')).toHaveCount(1);
});

test('switched off he is gone and nothing of him is fetched', async ({ page }) => {
  const requested = await open(page, { nib: 'off' });
  await page.waitForTimeout(2500);
  await expect(island(page)).toHaveCount(0);
  expect(requested.some((url) => MODEL.test(url))).toBe(false);
});

test('with reduced motion he is a picture and the model is never fetched', async ({ page }) => {
  const requested = await open(page, { motion: 'reduced' });
  await expect(island(page)).toHaveAttribute('data-shape', 'card', { timeout: 8000 });
  await expect(island(page).locator('.nib-island__head')).toHaveAttribute('data-head', 'picture');
  await page.waitForTimeout(500);
  expect(requested.some((url) => MODEL.test(url))).toBe(false);
});
