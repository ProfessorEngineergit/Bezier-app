/**
 * Times speeds S1–S3, S6, S8 and S13 (start, new project, first solid, duplicate, undo/redo,
 * export, reopen) in Chromium and WebKit against the production build, with a persistent OPFS
 * profile. Each step is timed from the action until the app is no longer busy; medians of RUNS.
 *
 *   pnpm build && pnpm --filter @bezier/studio preview --port 4173
 *   node scripts/speed-suite.mjs [url] [engine]
 *
 * A script, not a test: absolute times depend on the machine (see frame-budget.mjs).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/';
const only = process.argv[3];
const RUNS = Number(process.env.RUNS ?? 3);
const DUPLICATES = 8;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

/**
 * Machine tiers: `GPU=off` renders in software; `CPU_THROTTLE=4` slows the CPU fourfold to
 * approximate weaker hardware. Both default to the machine as is.
 */
function chromiumArgs() {
  if (process.env.GPU === 'off') return ['--disable-gpu'];
  const angle = { darwin: 'metal', win32: 'd3d11' }[process.platform];
  return [...(angle ? [`--use-angle=${angle}`] : []), '--enable-gpu', '--ignore-gpu-blocklist'];
}

async function throttle(context, page, name) {
  const rate = Number(process.env.CPU_THROTTLE ?? 1);
  if (name !== 'chromium' || !(rate > 1)) return;
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
}

const rail = (page, name) =>
  page.locator('.rail__icon').filter({ has: page.getByText(name, { exact: true }) });

/** Counts busy-to-idle transitions so that short busy periods are not missed. */
async function watchBusy(page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    const state = { ends: 0, busy: root.hasAttribute('data-busy') };
    window.__speed = state;
    new MutationObserver(() => {
      const busy = root.hasAttribute('data-busy');
      if (state.busy && !busy) state.ends += 1;
      state.busy = busy;
    }).observe(root, { attributes: true, attributeFilter: ['data-busy'] });
  });
}

/** Returns the app's `bezier:` measures since the last call, summed by name. */
async function measures(page) {
  return page.evaluate(() => {
    const out = {};
    for (const entry of performance.getEntriesByType('measure')) {
      if (!entry.name.startsWith('bezier:')) continue;
      const key = entry.name.slice('bezier:'.length);
      out[key] = Math.round((out[key] ?? 0) + entry.duration);
    }
    performance.clearMeasures();
    return out;
  });
}

const breakdowns = {};

/** Runs `act` and waits until the app is idle again. Returns milliseconds. */
async function timed(page, act, label) {
  if (label !== undefined) await measures(page);
  const before = await page.evaluate(() => window.__speed.ends);
  const started = Date.now();
  await act();
  await page.waitForFunction(
    (count) =>
      window.__speed.ends > count &&
      !document.documentElement.hasAttribute('data-busy') &&
      document.querySelectorAll('.status__label').length === 0,
    before,
    { timeout: 120_000, polling: 'raf' },
  );
  const spent = Date.now() - started;
  if (label !== undefined) breakdowns[label] = await measures(page);
  return spent;
}

async function download(page, label) {
  const started = Date.now();
  await page.locator('.titlebar__export').click();
  const file = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
  await (await file).path();
  return Date.now() - started;
}

async function once(engine, name) {
  const profile = mkdtempSync(join(tmpdir(), `bezier-speed-${name}-`));
  const context = await engine.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    ...(name === 'chromium' ? { args: chromiumArgs() } : {}),
  });
  const page = await context.newPage();
  await throttle(context, page, name);
  const times = {};
  try {
    // WebKit keeps OPFS per origin across profiles; start from nothing.
    await page.goto(`${url}bench.html`);
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const entry of root.keys()) await root.removeEntry(entry, { recursive: true });
      localStorage.clear();
    });

    const started = Date.now();
    await page.goto(url);
    await page.locator('.library[data-loaded]').waitFor({ timeout: 120_000 });
    times['S1 start → projects'] = Date.now() - started;

    await watchBusy(page);
    times['S2 new project'] = await timed(page, () =>
      page.getByRole('button', { name: 'New Project' }).first().click(),
    );
    await page.locator('canvas.viewport').waitFor();

    times['S6 first solid'] = await timed(
      page,
      async () => {
        await rail(page, 'Tools').click();
        await rail(page, 'Extrude').click();
      },
      'S6 first solid',
    );

    if (!(await page.locator('.items-panel').isVisible())) await rail(page, 'Items').click();
    await page.locator('.tree-row[data-kind="body"] .tree-row__main, .body-row').first().waitFor();
    const duplicates = [];
    for (let i = 0; i < DUPLICATES; i++) {
      await page.locator('.tree-row[data-kind="body"] .tree-row__main, .body-row').first().click();
      duplicates.push(await timed(page, () => page.keyboard.press('ControlOrMeta+d')));
    }
    const bodies = await page.locator('.tree-row[data-kind="body"], .body-row').count();
    if (bodies !== DUPLICATES + 1)
      throw new Error(`expected ${DUPLICATES + 1} bodies, found ${bodies}`);
    times['S6 duplicate a body'] = median(duplicates);
    times[`S6 duplicate, ${DUPLICATES + 1}th body`] = duplicates.at(-1);

    times['S8 undo'] = await timed(page, () => page.keyboard.press('ControlOrMeta+z'), 'S8 undo');
    times['S8 redo'] = await timed(page, () => page.keyboard.press('ControlOrMeta+Shift+z'));

    times['S13 export STL'] = await download(page, 'STL');
    times['S13 export STEP'] = await download(page, 'STEP');
    times['S13 export 3MF'] = await download(page, '3MF');

    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.locator('.library').waitFor();
    // The thumbnail is saved shortly after leaving and redraws the tiles; the tile with an image is
    // the project just closed.
    await page.locator('.tile__face:has(img)').first().waitFor();
    await page.waitForTimeout(500);
    times['S3 reopen project'] = await timed(
      page,
      () => page.locator('.tile__face:has(img)').first().click(),
      'S3 reopen project',
    );
  } catch (error) {
    await page.screenshot({ path: join(tmpdir(), 'speed-suite-failure.png') });
    throw error;
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
  return times;
}

for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  if (only !== undefined && only !== name) continue;
  const runs = [];
  for (let run = 0; run < RUNS; run++) runs.push(await once(engine, name));
  console.log(`\n=== ${name}, median of ${RUNS} ===`);
  for (const key of Object.keys(runs[0])) {
    const values = runs.map((r) => r[key]);
    console.log(
      `${key.padEnd(32)} ${String(median(values)).padStart(6)} ms   [${values.join(', ')}]`,
    );
  }
  // Machine-readable summary line.
  console.log(
    `RESULT ${JSON.stringify({
      engine: name,
      platform: process.platform,
      gpu: process.env.GPU ?? 'on',
      cpuThrottle: Number(process.env.CPU_THROTTLE ?? 1),
      runs: RUNS,
      medianMs: Object.fromEntries(
        Object.keys(runs[0]).map((key) => [key, median(runs.map((r) => r[key]))]),
      ),
    })}`,
  );
  console.log('last run, by phase:');
  for (const [label, phases] of Object.entries(breakdowns)) {
    console.log(`  ${label.padEnd(30)} ${JSON.stringify(phases)}`);
  }
}
