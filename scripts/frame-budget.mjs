/**
 * Runs `bench.html` in a real browser and prints frame costs against the ADR 0007 budgets (8 ms
 * for camera movement, 8 ms for hover).
 *
 * A script, not a test: absolute frame times depend on the machine, so compare against a base
 * branch rather than a constant.
 *
 *   pnpm --filter @bezier/studio dev      # in one terminal
 *   pnpm bench:frames                     # in another
 *
 * Pass a URL to use another server, e.g. a preview build.
 */

import { chromium, webkit } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5173/bench.html';

/**
 * Playwright's WebKit approximates but is not the system WKWebView the app ships in; for final
 * numbers open /bench.html inside the packaged app.
 */
const engines = [
  ['chromium', chromium],
  ['webkit', webkit],
];

for (const [name, engine] of engines) {
  let browser;
  try {
    // Headed: headless has no GPU and falls back to software rasterisation (a 204k-triangle scene
    // took 86 ms per frame), which says nothing about real performance.
    browser = await engine.launch({ headless: false });
  } catch (error) {
    console.log(`\n${name}: not installed (${String(error).split('\n')[0]})`);
    continue;
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(String(error)));

  try {
    await page.goto(url);
    await page.waitForSelector('#verdict', { timeout: 180_000 });

    const rows = await page.$$eval('#results tbody tr', (trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')),
    );
    const verdict = await page.textContent('#verdict');

    console.log(`\n=== ${name} ===`);
    console.log('triangles     cpu p95   gap p95  pick p95   hits  run');
    for (const row of rows) {
      console.log(
        row[0].padEnd(12),
        row[1].padStart(8),
        row[2].padStart(9),
        row[3].padStart(9),
        row[4].padStart(6),
        ` ${row[5] ?? ''}`,
      );
    }
    console.log(`verdict: ${verdict}`);
    if (verdict?.startsWith('INVALID')) process.exitCode = 1;
    if (problems.length > 0) console.log('console errors:', problems);
  } catch (error) {
    console.log(`\n=== ${name} === failed: ${String(error).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

console.log(
  '\nThese are this machine, in this browser. The number that decides how the\n' +
    'app is packaged is the same page inside the desktop webview — run the\n' +
    'built app and open /bench.html there.\n',
);
