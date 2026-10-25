/**
 * Measures budget E (cold load to an interactive shell) and E2 (kernel ready) against the
 * production build, in Chromium and WebKit.
 *
 *   pnpm build
 *   pnpm --filter @bezier/studio preview --port 4173   # one terminal
 *   node scripts/load-budget.mjs                       # another
 *
 * Each run uses a fresh browser context, so nothing is cached. Shell time ends when the start page
 * is shown. The kernel loads lazily, so kernel time runs from requesting the starter box to its
 * triangles being on screen, including fetching and starting the WebAssembly worker.
 */

import { chromium, webkit } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/';
const RUNS = 5;

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? Number.NaN;
};

for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  let browser;
  try {
    browser = await engine.launch({ headless: process.env.HEADED !== '1' });
  } catch (error) {
    console.log(`\n${name}: not installed (${String(error).split('\n')[0]})`);
    continue;
  }
  const shell = [];
  const kernel = [];
  try {
    for (let run = 0; run < RUNS; run += 1) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const started = Date.now();
      await page.goto(url);
      await page.locator('.library').waitFor({ timeout: 60_000 });
      shell.push(Date.now() - started);
      // A fresh context has no projects.
      await page.getByRole('button', { name: 'New Project' }).first().click();
      await page.locator('canvas.viewport').waitFor({ timeout: 60_000 });
      const asked = Date.now();
      await page.locator('.rail__icon', { hasText: 'Tools' }).click();
      await page.locator('.rail__icon', { hasText: 'Extrude' }).click();
      await page
        .locator('canvas.viewport[data-triangles]:not([data-triangles="0"])')
        .waitFor({ timeout: 60_000 });
      kernel.push(Date.now() - asked);
      await context.close();
    }
    console.log(`\n=== ${name}, ${RUNS} cold runs ===`);
    console.log(
      `shell interactive  p50 ${percentile(shell, 50)} ms  worst ${Math.max(...shell)} ms`,
    );
    console.log(
      `first geometry     p50 ${percentile(kernel, 50)} ms  worst ${Math.max(...kernel)} ms`,
    );
  } catch (error) {
    console.log(`\n=== ${name} === failed: ${String(error).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}
