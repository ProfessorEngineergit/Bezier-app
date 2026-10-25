/**
 * Timings on the full Voron assembly (241 MB of STEP, 1715 solids). Not part of the suite: runs
 * only with VORON set, in WebKit (Chromium's 4 GB heap runs out reading it). Env flags below
 * select other scenarios.
 *
 *   VORON=/path/to/AUDIT-Voron-2.4r2-Assembly-complete.step E2E_WEBKIT=1 \
 *     pnpm exec playwright test --project=webkit e2e/view/perf-voron.spec.ts
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApp, openItems, railButton } from '../app.js';
import { test as base, expect } from '../fixtures.js';

/**
 * Uses a persistent on-disk profile, emptied each run: WebKit does not open OPFS in an ephemeral
 * context, and the app's fallback path is not the one the desktop app takes.
 */
const test = base.extend({
  page: async ({ playwright, baseURL, viewport, browserName }, use) => {
    const profile = mkdtempSync(join(tmpdir(), 'bezier-perf-'));
    const context = await playwright[browserName].launchPersistentContext(profile, {
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(viewport === null ? {} : { viewport }),
      // HEADED=1: a window with the real GPU. Headless rendering is software-only, where one Voron
      // frame takes seconds.
      ...(process.env.HEADED === '1' ? { headless: false } : {}),
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },
});

const VORON = process.env.VORON;

test('Voron: import, then move one part and time until it stands in its new place', async ({
  page,
}) => {
  test.skip(VORON === undefined, 'set VORON to the assembly to run this');
  test.setTimeout(1_800_000);
  await page.addInitScript(() => {
    (globalThis as { __bezierTraceKernel?: boolean }).__bezierTraceKernel = true;
    try {
      window.localStorage.setItem('bezier.e2e', '1');
    } catch {
      // Without it the pose hook is missing, which only the LOOK shots need.
    }
  });
  // SMALL=1: report four cores, as on a weak machine, so the background import takes that path
  // (no helper workers, no text outline).
  if (process.env.SMALL === '1')
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
    });
  // WebKit keeps OPFS outside the profile, so clear earlier runs' projects and cached shapes;
  // otherwise the import is a reopen.
  await page.goto('/');
  await page.evaluate(async () => {
    const root = (await navigator.storage.getDirectory()) as unknown as {
      keys(): AsyncIterable<string>;
      removeEntry(name: string, options: { recursive: boolean }): Promise<void>;
    };
    const names: string[] = [];
    for await (const name of root.keys()) names.push(name);
    for (const name of names) await root.removeEntry(name, { recursive: true });
  });
  await openApp(page);
  // OPFS must be available here, as in the desktop app (see the profile above).
  expect(
    await page.evaluate(() =>
      navigator.storage.getDirectory().then(
        () => true,
        () => false,
      ),
    ),
  ).toBe(true);
  const t0 = Date.now();
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles(VORON as string);
  await openItems(page);
  await expect(page.locator('.body-row').first()).toBeVisible({ timeout: 900_000 });
  await expect(page.locator('html[data-busy]')).toHaveCount(0, { timeout: 900_000 });
  console.log('PERF import', Date.now() - t0, 'ms');
  console.log(
    'PERF import kernel:',
    await page.evaluate(() =>
      Object.entries(
        (globalThis as { __bezierKernelCalls?: Record<string, { calls: number; ms: number }> })
          .__bezierKernelCalls ?? {},
      )
        .sort((a, b) => b[1].ms - a[1].ms)
        .slice(0, 12)
        .map(([name, { calls, ms }]) => `${name}×${calls} ${Math.round(ms)}`)
        .join(' | '),
    ),
    '::',
    await page.evaluate(() =>
      performance
        .getEntriesByType('measure')
        .filter((m) => m.name.startsWith('bezier:'))
        .map((m) => `${m.name.slice(7)} ${Math.round(m.duration)}`)
        .join(' | '),
    ),
  );
  await page.screenshot({ path: test.info().outputPath('imported.png') });

  // VIZ=1: open Visualize on the loaded model. Logs the longest main-thread hold and the time to
  // the first picture.
  if (process.env.VIZ === '1') {
    await page.evaluate(() => {
      // Frame gaps: a page blocked for a second shows as a one-second gap (WebKit has no long-task
      // observer).
      const holds: number[] = [];
      let last = performance.now();
      const tick = (now: number) => {
        holds.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (window as { __holds?: number[] }).__holds = holds;
    });
    const began = Date.now();
    await page.getByRole('button', { name: /Workspace:/ }).click();
    await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
    await page.locator('.workspace[data-workspace="visualize"] canvas').first().waitFor();
    // A click on a small control must respond while bodies are still loading.
    const answered = Date.now();
    await page.getByRole('tab', { name: 'Environment' }).click();
    const answeredIn = Date.now() - answered;
    await page.waitForTimeout(Number(process.env.VIZ_WAIT ?? 30000));
    const holds = await page.evaluate(() => (window as { __holds?: number[] }).__holds ?? []);
    console.log(
      'PERF visualize',
      `canvas ${Date.now() - began - answeredIn} ms`,
      `click answered in ${answeredIn} ms`,
      `longest hold ${Math.round(Math.max(0, ...holds))} ms`,
      `holds over 200 ms: ${holds.filter((h) => h > 200).length}`,
    );
    await page.screenshot({ path: test.info().outputPath('visualize.png') });
    return;
  }

  // UNDO=1: add a box beside the model and remove it with undo, timing each stage. Removing a small
  // thing must not cost what the large model costs.
  if (process.env.UNDO === '1') {
    const { addBox } = await import('../app.js');
    await addBox(page);
    await page.waitForTimeout(8000);
    for (const [label, key] of [
      ['delete', 'ITEMS'],
      ['undo', 'Meta+z'],
      ['redo', 'Meta+Shift+z'],
      ['undo again', 'Meta+z'],
    ] as const) {
      await page.evaluate(() => performance.clearMeasures());
      const began = Date.now();
      if (key === 'ITEMS') {
        // Remove the last history step with its own Delete button.
        const { openItems } = await import('../app.js');
        await openItems(page);
        await page.locator('button[aria-label^="Delete "]').last().click();
      } else await page.keyboard.press(key);
      await page.waitForTimeout(6000);
      console.log(
        `PERF ${label}:`,
        await page.evaluate(() =>
          performance
            .getEntriesByType('measure')
            .filter((m) => m.name.startsWith('bezier:'))
            .map((m) => `${m.name.slice(7)}@${Math.round(m.startTime)}+${Math.round(m.duration)}`)
            .join(' | '),
        ),
        `(waited ${String(Date.now() - began)} ms)`,
      );
    }
    return;
  }

  // DRAWINGS=1 or SIMULATION=1: open that workspace, log frame gaps and time until the work is
  // done, then switch back, which must respond at once.
  const other =
    process.env.DRAWINGS === '1'
      ? 'Drawings'
      : process.env.SIMULATION === '1'
        ? 'Simulation'
        : null;
  if (other !== null) {
    await page.evaluate(() => {
      const holds: number[] = [];
      let last = performance.now();
      const tick = (now: number) => {
        holds.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (window as { __holds?: number[] }).__holds = holds;
    });
    const began = Date.now();
    await page.getByRole('button', { name: /Workspace:/ }).click();
    await page.getByRole('menuitemradio', { name: new RegExp(`^${other}`) }).click();
    // Drawings shows "Projecting views…" while working: wait for it to appear, then disappear.
    const loading = page.locator('.dwg__loading');
    await loading.waitFor({ state: 'visible', timeout: 60000 }).catch(() => undefined);
    const done = await loading
      .waitFor({ state: 'hidden', timeout: Number(process.env.WAIT ?? 180000) })
      .then(() => Date.now() - began)
      .catch(() => -1);
    const holds = await page.evaluate(() => (window as { __holds?: number[] }).__holds ?? []);
    console.log(
      `PERF ${other}`,
      `work finished after ${done} ms`,
      `longest hold ${Math.round(Math.max(0, ...holds))} ms`,
      `holds over 200 ms: ${holds.filter((h) => h > 200).length}`,
    );
    await page.screenshot({ path: test.info().outputPath('other.png') });
    const home = Date.now();
    await page.getByRole('button', { name: /Workspace:/ }).click({ timeout: 120000 });
    await page.getByRole('menuitemradio', { name: /^Modeling/ }).click({ timeout: 120000 });
    console.log(`PERF back to Modeling answered in ${Date.now() - home} ms`);
    return;
  }

  // REOPEN=1: back to the projects and into the project again, a screenshot every 600 ms, to see
  // what is on screen while the model loads.
  if (process.env.REOPEN === '1') {
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page.locator('.library[data-loaded]')).toBeVisible();
    await page.waitForTimeout(2000);
    // Cold: reload so the project is read from storage, not reused from memory.
    await page.reload();
    await expect(page.locator('.library[data-loaded]')).toBeVisible();
    await page.locator('.tile__face').first().click();
    if (process.env.REOPEN_FULL === '1') {
      // Let it open and log what ran when; duplicated work would show here.
      const began = Date.now();
      await page.evaluate(() => performance.clearMeasures());
      await expect(page.locator('#boot')).toBeHidden({ timeout: 240_000 });
      console.log(`PERF cold open: loader gone after ${Date.now() - began} ms`);
      await page.waitForTimeout(15_000);
      if (process.env.VIZ_AFTER === '1') {
        // Visualize on the freshly opened project, plus any errors logged.
        const said: string[] = [];
        page.on('pageerror', (error) => said.push(`pageerror ${error.message.slice(0, 200)}`));
        page.on('console', (message) => {
          if (message.type() === 'error') said.push(`console ${message.text().slice(0, 200)}`);
        });
        await page.getByRole('button', { name: /Workspace:/ }).click();
        await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
        await page.waitForTimeout(25_000);
        await page.screenshot({ path: test.info().outputPath('visualize-after.png') });
        const home = Date.now();
        await page
          .getByRole('button', { name: 'Projects', exact: true })
          .click({ timeout: 60_000 });
        await expect(page.locator('.library[data-loaded]')).toBeVisible({ timeout: 60_000 });
        console.log(`PERF home from Visualize ${Date.now() - home} ms; said: ${said.join(' || ')}`);
        return;
      }
      console.log(
        'PERF cold open marks:',
        await page.evaluate(() =>
          performance
            .getEntriesByType('measure')
            .filter((m) => m.name.startsWith('bezier:'))
            .map((m) => `${m.name.slice(7)}@${Math.round(m.startTime)}+${Math.round(m.duration)}`)
            .join(' | '),
        ),
      );
      return;
    }
    await page.waitForTimeout(Number(process.env.REOPEN_WAIT ?? 1500));
    await page.screenshot({ path: test.info().outputPath('loading.png') });
    if (process.env.REOPEN_POKE === '1') {
      // Interact while it opens: the progress chip, the name, a click on the picture.
      const chip = page.locator('.work-chip');
      const where = (await chip.count()) > 0 ? await chip.first().boundingBox() : null;
      if (where !== null)
        await page.mouse.click(where.x + where.width / 2, where.y + where.height / 2);
      await page
        .locator('.titlebar__name')
        .click({ force: true, timeout: 2000 })
        .catch(() => undefined);
      await page.keyboard.type('Renamed');
      await page.keyboard.press('Enter');
      await page.mouse.click(700, 400);
      await page.waitForTimeout(500);
      await page.screenshot({ path: test.info().outputPath('poked.png') });
      console.log(
        'PERF poke: panels',
        await page.locator('.work-panel').count(),
        'name',
        await page
          .locator('.titlebar__name, .titlebar__nameInput')
          .first()
          .innerText()
          .catch(() => '?'),
        'chip found',
        where !== null,
      );
    }
    const home = Date.now();
    await page.getByRole('button', { name: 'Projects', exact: true }).click({ timeout: 120_000 });
    await expect(page.locator('.library[data-loaded]')).toBeVisible({ timeout: 120_000 });
    console.log(`PERF home during opening answered in ${Date.now() - home} ms`);
    await page.screenshot({ path: test.info().outputPath('after-home.png') });
    await page.locator('.tile__face').first().click();
    for (let i = 0; i < 14; i++) {
      await page.screenshot({
        path: test.info().outputPath(`reopen-${String(i).padStart(2, '0')}.png`),
      });
      await page.waitForTimeout(600);
    }
    return;
  }

  // LOOK=dir: close-up screenshots to judge line and shading quality (LOOK_AT=x,y of the region to
  // zoom into).
  if (process.env.LOOK !== undefined) {
    // Move the camera towards its target by LOOK_NEAR (a fraction of the distance), so runs match.
    const near = Number(process.env.LOOK_NEAR ?? 0.12);
    // LOOK_POINT=x,y,z with LOOK_FROM=dx,dy,dz and LOOK_DIST: look at that point from that side at
    // that distance, instead.
    const point = process.env.LOOK_POINT?.split(',').map(Number);
    const from = (process.env.LOOK_FROM ?? '-1,-0.4,0.5').split(',').map(Number);
    const distance = Number(process.env.LOOK_DIST ?? 80);
    await page.evaluate(
      ({ point, from, distance }) => {
        if (point === undefined) return;
        const viewport = (
          window as {
            __bezierViewport?: { showCameraView(view: unknown): void };
          }
        ).__bezierViewport;
        if (viewport === undefined) throw new Error('no viewport hook');
        const length = Math.hypot(...from) || 1;
        const position = point.map((v, i) => v + ((from[i] ?? 0) / length) * distance);
        viewport.showCameraView({ position, target: point, parallel: false, zoom: 1 });
      },
      { point, from, distance },
    );
    if (point === undefined) {
      await page.evaluate((fraction) => {
        const viewport = (
          window as {
            __bezierViewport?: {
              cameraView(): {
                position: number[];
                target: number[];
                parallel: boolean;
                zoom: number;
              };
              showCameraView(view: unknown): void;
            };
          }
        ).__bezierViewport;
        if (viewport === undefined) throw new Error('no viewport hook');
        const now = viewport.cameraView();
        const at = now.target;
        const position = now.position.map((v, i) => (at[i] ?? 0) + (v - (at[i] ?? 0)) * fraction);
        viewport.showCameraView({ position, target: at, parallel: false, zoom: 1 });
      }, near);
    }
    await page.waitForTimeout(20000);
    // Frame gaps while the pointer moves over the model.
    await page.evaluate(() => {
      const gaps: number[] = [];
      let last = performance.now();
      const tick = (now: number) => {
        gaps.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (window as { __gaps?: number[] }).__gaps = gaps;
    });
    // LOOK_HOVER=x,y;x,y: hover each point and take a screenshot.
    for (const [index, spot] of (process.env.LOOK_HOVER ?? '')
      .split(';')
      .filter(Boolean)
      .entries()) {
      const [x, y] = spot.split(',').map(Number);
      await page.mouse.move((x ?? 0) - 5, (y ?? 0) - 5);
      await page.mouse.move(x ?? 0, y ?? 0, { steps: 4 });
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: `${process.env.LOOK}/${process.env.LOOK_NAME ?? 'look'}-hover${String(index)}.png`,
      });
    }
    const gaps = await page.evaluate(() => (window as { __gaps?: number[] }).__gaps ?? []);
    console.log(
      'PERF hover: longest gap',
      Math.round(Math.max(0, ...gaps)),
      'ms, over 300 ms:',
      gaps.filter((g) => g > 300).length,
    );
    await page.screenshot({ path: `${process.env.LOOK}/${process.env.LOOK_NAME ?? 'look'}.png` });
    return;
  }

  // SHOT=dir: screenshots at rest and mid-turn at the same size, for comparing lines.
  if (process.env.SHOT !== undefined) {
    await page.mouse.move(900, 500);
    await page.waitForTimeout(12000);
    await page.screenshot({ path: `${process.env.SHOT}/rest.png` });
    await page.mouse.move(900, 500);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 12; i++) await page.mouse.move(900 + i * 5, 500 + i * 2, { steps: 1 });
    await page.screenshot({ path: `${process.env.SHOT}/turning.png` });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(12000);
    await page.screenshot({ path: `${process.env.SHOT}/after.png` });
    return;
  }

  // SELECT=1: select the whole model (Ctrl+A), then turn it, logging frame gaps.
  if (process.env.SELECT === '1') {
    const cdp =
      process.env.PROFILE !== undefined &&
      page.context().browser()?.browserType().name() !== 'webkit'
        ? await page.context().newCDPSession(page)
        : null;
    await cdp?.send('Profiler.enable');
    await cdp?.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp?.send('Profiler.start');
    await page.evaluate(() => {
      const scope = globalThis as { __gaps?: string[]; __from?: number; __frames?: number };
      scope.__gaps = [];
      scope.__frames = 0;
      scope.__from = performance.now();
      let last = performance.now();
      const tick = (now: number) => {
        scope.__frames = (scope.__frames ?? 0) + 1;
        if (now - last > 100)
          scope.__gaps?.push(`${Math.round(last - (scope.__from ?? 0))}+${Math.round(now - last)}`);
        last = now;
        if (now - (scope.__from ?? 0) < 20000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.mouse.move(900, 500);
    await page.mouse.click(900, 500);
    if (process.env.SELECT_ONE === '1') {
      // Pick one part from the list, then turn the model.
      await page.locator('.body-row').nth(5).click();
    } else {
      await page.keyboard.press('ControlOrMeta+a');
    }
    const asked = Date.now();
    await page.waitForTimeout(8000);
    await page.mouse.move(900, 500);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(900 + i * 6, 500 + i * 2, { steps: 1 });
    await page.mouse.up();
    await page.waitForTimeout(8000);
    const gaps = await page.evaluate(() => (globalThis as { __gaps?: string[] }).__gaps ?? []);
    const frames = await page.evaluate(() => (globalThis as { __frames?: number }).__frames ?? 0);
    console.log(
      `PERF select: ${frames} frames in 20 s, gaps over 100 ms (at+ms): ${gaps.join(' ')}`,
    );
    console.log(`PERF select waited ${Date.now() - asked} ms in all`);
    if (cdp !== null) {
      const { profile } = await cdp.send('Profiler.stop');
      writeFileSync(`${process.env.PROFILE}-select.cpuprofile`, JSON.stringify(profile));
    }
    return;
  }

  for (let run = 1; run <= Number(process.env.RUNS ?? 3); run++) {
    await page.evaluate(() => {
      performance.clearMeasures();
      (globalThis as { __bezierKernelCalls?: object }).__bezierKernelCalls = {};
      (globalThis as { __bezierKernelEvents?: unknown[] }).__bezierKernelEvents = [];
    });
    if (process.env.MOVEALL === '1') {
      // Select every body from the list, then move them as one.
      await page.locator('.body-row').first().click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.waitForTimeout(3000);
    } else {
      await page
        .locator('.body-row')
        .nth(5 + run)
        .click();
    }
    // Chromium: profile the page while the tool opens (PROFILE=path).
    const openCdp =
      process.env.PROFILE !== undefined && process.env.MOVEALL === '1' && run === 1
        ? await page.context().newCDPSession(page)
        : null;
    if (openCdp !== null) {
      await openCdp.send('Profiler.enable');
      await openCdp.send('Profiler.start');
    }
    await page.keyboard.press('m');
    if (process.env.MOVEALL === '1') {
      // Fall back to the rail button if the key did nothing.
      await page.waitForTimeout(2000);
      if ((await page.getByRole('toolbar', { name: 'Move and rotate' }).count()) === 0) {
        await page.locator('.rail--left button[title="Transform"]').click();
        await page.waitForTimeout(1500);
        await page.getByText('Move/Rotate', { exact: false }).first().click();
      }
      await page.waitForTimeout(3000);
      await page.screenshot({ path: test.info().outputPath(`after-m-${run}.png`) });
      const facts = {
        toolbar: await page.getByRole('toolbar', { name: 'Move and rotate' }).count(),
        busy: await page.evaluate(() => document.documentElement.dataset.busy ?? 'no'),
        rail: await page
          .locator('.rail--left button')
          .evaluateAll((all) =>
            all.map(
              (b) =>
                `${b.getAttribute('title') ?? b.getAttribute('aria-label')}${(b as HTMLButtonElement).disabled ? '(off)' : ''}`,
            ),
          ),
        status: (await page.locator('[role=status], [role=alert]').allInnerTexts()).map((t) =>
          t.replace(/\s+/g, ' ').trim(),
        ),
      };
      writeFileSync(test.info().outputPath('after-m.json'), JSON.stringify(facts, null, 1));
    }
    if (openCdp !== null) {
      await page.waitForTimeout(20_000);
      const { profile } = await openCdp.send('Profiler.stop');
      writeFileSync(`${process.env.PROFILE}-open.cpuprofile`, JSON.stringify(profile));
    }
    const arrow = page.getByRole('button', { name: 'Move X', exact: true });
    await expect(arrow).toBeVisible({ timeout: 240_000 });
    const box = await arrow.boundingBox();
    if (box === null) throw new Error('no arrow');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const drag = Date.now();
    for (let i = 1; i <= 20; i++) await page.mouse.move(x + i * 4, y, { steps: 1 });
    const dragged = Date.now() - drag;
    // Chromium: JavaScript profile of the second release (PROFILE=path).
    const releaseCdp =
      process.env.PROFILE !== undefined &&
      run === 2 &&
      page.context().browser()?.browserType().name() !== 'webkit'
        ? await page.context().newCDPSession(page)
        : null;
    await releaseCdp?.send('Profiler.enable');
    await releaseCdp?.send('Profiler.setSamplingInterval', { interval: 200 });
    await releaseCdp?.send('Profiler.start');
    const released = Date.now();
    const releasedAt = await page.evaluate(() => {
      // Main-thread holds after the release: frame gaps over 100 ms.
      const scope = globalThis as { __gaps?: string[]; __from?: number };
      scope.__gaps = [];
      scope.__from = performance.now();
      let last = performance.now();
      const tick = (now: number) => {
        if (now - last > 100)
          scope.__gaps?.push(`${Math.round(last - (scope.__from ?? 0))}+${Math.round(now - last)}`);
        last = now;
        if (now - (scope.__from ?? 0) < 8000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return performance.now();
    });
    await page.mouse.up();
    // SAMPLE=path: sample the page process for two seconds after the second release (macOS).
    if (process.env.SAMPLE !== undefined && run === 2) {
      const { exec } = await import('node:child_process');
      exec(
        `sample $(pgrep -f 'webkit.*WebContent' | head -1) 2 -file ${process.env.SAMPLE}`,
        () => undefined,
      );
    }
    await expect(page.locator('html[data-busy]')).toHaveCount(0, { timeout: 300_000 });
    const settled = Date.now() - released;
    // Idle: no change still running behind the drawn result, so the next drag can start.
    await expect(page.getByRole('button', { name: 'Updating the model' })).toHaveCount(0, {
      timeout: 300_000,
    });
    const idle = Date.now() - released;
    if (releaseCdp !== null) {
      const { profile } = await releaseCdp.send('Profiler.stop');
      writeFileSync(`${process.env.PROFILE}-release.cpuprofile`, JSON.stringify(profile));
    }
    const measures = await page.evaluate(() =>
      performance
        .getEntriesByType('measure')
        .filter((m) => m.name.startsWith('bezier:'))
        .map((m) => `${m.name.slice(7)} ${Math.round(m.duration)}`),
    );
    const calls = await page.evaluate(() =>
      Object.entries(
        (globalThis as { __bezierKernelCalls?: Record<string, { calls: number; ms: number }> })
          .__bezierKernelCalls ?? {},
      )
        .sort((a, b) => b[1].ms - a[1].ms)
        .map(([name, { calls, ms }]) => `${name}×${calls} ${Math.round(ms)}`),
    );
    console.log(`PERF kernel ${run}: ${calls.join(' | ')}`);
    // Kernel calls around the release, as method@start+duration relative to it.
    const around = await page.evaluate(
      (at) =>
        (
          (globalThis as { __bezierKernelEvents?: [string, number, number][] })
            .__bezierKernelEvents ?? []
        )
          .filter(([, start, ms]) => start + ms > at - 3000)
          .map(([name, start, ms]) => `${name}@${Math.round(start - at)}+${Math.round(ms)}`),
      releasedAt,
    );
    console.log(`PERF calls ${run}: ${around.join(' ')}`);
    const gaps = await page.evaluate(() => (globalThis as { __gaps?: string[] }).__gaps ?? []);
    console.log(`PERF gaps ${run}: ${gaps.join(' ')}`);
    console.log(
      `PERF move ${run}: drag ${dragged} ms for 20 moves, release→settled ${settled} ms, →idle ${idle} ms :: ${measures.join(' | ')}`,
    );
    await page.keyboard.press('Escape');
  }

  // Warm reopen (audit F-062): back to the projects and in again, until the model is shown and the
  // app is idle.
  for (let run = 1; run <= 3; run++) {
    await expect(page.locator('html[data-busy]')).toHaveCount(0, { timeout: 300_000 });
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page.locator('.library')).toBeVisible();
    await page.evaluate(() => {
      performance.clearMeasures();
      // Main-thread holds: every frame gap over 100 ms, from the click.
      const scope = globalThis as { __gaps?: string[]; __from?: number };
      scope.__gaps = [];
      scope.__from = performance.now();
      let last = performance.now();
      const tick = (now: number) => {
        if (now - last > 100)
          scope.__gaps?.push(`${Math.round(last - (scope.__from ?? 0))}+${Math.round(now - last)}`);
        last = now;
        if ((scope.__gaps?.length ?? 0) < 50) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Chromium: JavaScript profile of the reopen (PROFILE=path).
    const cdp =
      process.env.PROFILE !== undefined &&
      page.context().browser()?.browserType().name() !== 'webkit'
        ? await page.context().newCDPSession(page)
        : null;
    await cdp?.send('Profiler.enable');
    await cdp?.send('Profiler.start');
    const opened = Date.now();
    await page.locator('.tile__face').first().click();
    await expect(page.locator('.body-row').first()).toBeVisible({ timeout: 300_000 });
    await expect(page.locator('html[data-busy]')).toHaveCount(0, { timeout: 300_000 });
    const shown = Date.now() - opened;
    if (cdp !== null) {
      const { profile } = await cdp.send('Profiler.stop');
      writeFileSync(`${process.env.PROFILE}-${run}.cpuprofile`, JSON.stringify(profile));
    }
    const measures = await page.evaluate(() =>
      performance
        .getEntriesByType('measure')
        .filter((m) => m.name.startsWith('bezier:'))
        .map((m) => `${m.name.slice(7)} ${Math.round(m.duration)}`),
    );
    const gaps = await page.evaluate(() => (globalThis as { __gaps?: string[] }).__gaps ?? []);
    const marks = await page.evaluate(() =>
      performance
        .getEntriesByType('measure')
        .filter((m) => m.name.startsWith('bezier:'))
        .map(
          (m) =>
            `${m.name.slice(7)}@${Math.round(m.startTime - ((globalThis as { __from?: number }).__from ?? 0))}`,
        ),
    );
    console.log(
      `PERF reopen ${run}: ${shown} ms :: ${measures.join(' | ')} :: starts ${marks.join(' ')} :: frame gaps ${gaps.join(' ')}`,
    );
  }
});
