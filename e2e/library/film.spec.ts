/**
 * The introduction film on first start. It never blocks the app: no address shows nothing, a
 * failed fetch closes quietly, and a playing film cannot be skipped the first time.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.js';

const tiny = readFileSync(
  fileURLToPath(new URL('../fixtures-files/film-test.webm', import.meta.url)),
);

async function filmAt(page: Page, url: string | null): Promise<void> {
  await page.addInitScript((address) => {
    if (window !== window.top) return;
    if (address !== null) localStorage.setItem('bezier.film.url', address);
  }, url);
  await page.route('**/film-test.webm', (route) =>
    route.fulfill({ body: tiny, contentType: 'video/webm' }),
  );
  await page.goto('/');
}

test('without an address no film is shown', async ({ page }) => {
  // Release builds always ship a film address.
  test.skip(process.env.E2E_BUILT !== undefined, 'the build has its own film');
  await filmAt(page, null);
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Introduction film' })).toHaveCount(0);
});

test('a film that cannot be fetched closes by itself and is tried again next time', async ({
  page,
}) => {
  await filmAt(page, '/nothing-here.webm');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Introduction film' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('bezier.film.seen'))).toBeNull();
});

test('the first time the film cannot be skipped, and seen to the end it is marked seen', async ({
  page,
}) => {
  await filmAt(page, '/film-test.webm');
  const playable = await page.evaluate(
    () => document.createElement('video').canPlayType('video/webm; codecs="vp8"') !== '',
  );
  test.skip(!playable, 'this browser does not play WebM');
  const film = page.getByRole('dialog', { name: 'Introduction film' });
  await expect(film).toBeVisible();
  await expect(film.getByRole('button', { name: 'Skip' })).toBeDisabled();
  await expect(film).toHaveCount(0, { timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem('bezier.film.seen'))).not.toBeNull();
});

test('from the start page the picture plays the film again, and its bar jumps and shows the length', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.film.seen', new Date().toISOString());
    localStorage.setItem('bezier.preferences', JSON.stringify({ startPage: 'home', nib: 'off' }));
  });
  await filmAt(page, '/film-test.webm');
  const playable = await page.evaluate(
    () => document.createElement('video').canPlayType('video/webm; codecs="vp8"') !== '',
  );
  test.skip(!playable, 'this browser does not play WebM');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  // Already seen, so nothing autoplays.
  await expect(page.getByRole('dialog', { name: 'Introduction film' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play the intro film' }).click();
  const film = page.getByRole('dialog', { name: 'Introduction film' });
  await expect(film).toBeVisible();
  // Already seen, so Skip works; the bar seeks, with the time beside it.
  await expect(film.getByRole('button', { name: 'Skip' })).toBeEnabled();
  await expect(film.locator('.film__time')).toContainText(/\d:\d\d \/ \d:\d\d/);
  await film.getByRole('slider', { name: 'Position in the film' }).press('ArrowRight');
  // The test film is a second or two long, so it ends either way.
  await expect(film).toHaveCount(0, { timeout: 15_000 });
});
