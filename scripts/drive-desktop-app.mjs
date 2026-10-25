/**
 * Drives the packaged desktop app through its first-run flow and reports web view capabilities.
 *
 *   tauri-driver &
 *   node scripts/drive-desktop-app.mjs <path to the built app>
 *
 * The browser suite uses Playwright's WebKit, which differs from the Linux app's web view (e.g. no
 * OPFS, and H.264 recording is advertised but does not work).
 *
 * Flow: start page, new project, extrude a box, frame rate, projects, reload, restart. The project
 * must survive the reload and the restart. Exits 1 on failure; writes a Markdown table to the job
 * summary.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = process.argv[2];
if (APP === undefined) {
  console.error('usage: node scripts/drive-desktop-app.mjs <path to the built app>');
  process.exit(2);
}
const DRIVER = process.env.TAURI_DRIVER_URL ?? 'http://127.0.0.1:4444';
/** Software rendering on a GPU-less runner measures 42–51 fps; far below this is a regression. */
const MIN_FPS = Number(process.env.MIN_FPS ?? 15);
/** Seconds after an edit within which the frame rate must recover. */
const RECOVER_S = Number(process.env.RECOVER_S ?? 20);
const rows = [];

/**
 * Optional window screenshots for the documentation (Linux and Windows): set CAPTURE_DIR and
 * CAPTURE_CMD, a screen-capture command containing `{file}`. Does not affect pass/fail.
 */
const CAPTURE_DIR = process.env.CAPTURE_DIR;
const CAPTURE_CMD = process.env.CAPTURE_CMD;
if (CAPTURE_DIR !== undefined) mkdirSync(CAPTURE_DIR, { recursive: true });
async function capture(app, name, { renderer = false } = {}) {
  if (CAPTURE_DIR === undefined || CAPTURE_CMD === undefined) return;
  // Settle first: dark theme, no toasts and, in Visualize, the renderer started.
  await app.run(`document.documentElement.dataset.theme = 'dark'`).catch(() => undefined);
  await app
    .until('the notices to go', `return document.querySelectorAll('.toast').length === 0`, 15_000)
    .catch(() => undefined);
  if (renderer) {
    await app
      .until(
        'the renderer',
        `return !document.body.textContent.includes('Starting the renderer')`,
        240_000,
      )
      .catch(() => undefined);
  }
  // Let the last frame reach the screen.
  await sleep(1500);
  const file = join(CAPTURE_DIR, `${name}.png`);
  execSync(CAPTURE_CMD.replaceAll('{file}', file), { stdio: 'inherit' });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, body) {
  const response = await fetch(DRIVER + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.value;
}

async function launch() {
  const created = await call('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: APP } } },
  });
  const id = created.sessionId;
  const run = (script) => call('POST', `/session/${id}/execute/sync`, { script, args: [] });
  return {
    run,
    async until(label, script, timeoutMs = 90_000) {
      const started = Date.now();
      for (;;) {
        if (await run(script).catch(() => false)) return Date.now() - started;
        if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
        await sleep(250);
      }
    },
    close: () => call('DELETE', `/session/${id}`).catch(() => undefined),
  };
}

/**
 * Returns a script that clicks the first `selector` match whose text or aria-label is `text`.
 * With `prefix`, the text only has to start with it (menu items append a description).
 */
const click = (selector, text, prefix = false) => `
  const want = ${JSON.stringify(text)};
  const same = (found) => ${prefix ? 'found.startsWith(want)' : 'found === want'};
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(
    (e) => same(e.textContent.trim()) || e.getAttribute('aria-label') === want);
  if (!el) return false;
  el.click();
  return true;`;

const LOADED = `return !!document.querySelector('.library[data-loaded]')`;
const IDLE = `return !document.documentElement.hasAttribute('data-busy')`;
const BOX_DRAWN = `const c = document.querySelector('canvas.viewport'); return !!c && !!c.dataset.triangles && c.dataset.triangles !== '0'`;

function record(step, ok, detail) {
  rows.push({ step, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}: ${detail}`);
}

async function main() {
  let app = await launch();
  try {
    const caps = await app.run(`return {
      engine: navigator.userAgent.replace(/^.*AppleWebKit/, 'AppleWebKit'),
      opfs: typeof navigator.storage?.getDirectory === 'function',
      indexedDB: typeof indexedDB !== 'undefined',
      webgl2: !!document.createElement('canvas').getContext('webgl2'),
      recorder: typeof MediaRecorder !== 'undefined',
    }`);
    record('web view', caps.webgl2 && caps.indexedDB, JSON.stringify(caps));

    const loadMs = await app.until('the start page', LOADED);
    record('start page', true, `${loadMs} ms`);
    await capture(app, 'window-1-start');

    await app.run(click('button', 'New Project'));
    await app.until('the editor', `return !!document.querySelector('canvas.viewport')`);
    await app.until('the app to be idle', IDLE);
    await app.run(click('.rail__icon', 'Tools'));
    await sleep(500);
    await app.run(click('.rail__icon', 'Extrude'));
    const boxMs = await app.until('the box', BOX_DRAWN);
    await app.until('the app to be idle', IDLE);
    record('extrude a box', true, `${boxMs} ms`);
    await capture(app, 'window-2-editor');

    // Without a GPU the web view paints at about 4 fps for a few seconds after a model change
    // (docs/contributing/ci.md), so sample once a second until it recovers and report how long it
    // took.
    const sample = () =>
      app.run(`return new Promise((done) => {
        let n = 0; const t0 = performance.now();
        const tick = (t) => { n++; if (t - t0 > 1000) done(Math.round((10 * n) / ((t - t0) / 1000)) / 10); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick); })`);
    const readings = [];
    for (let second = 1; second <= RECOVER_S; second++) {
      readings.push(await sample());
      if (readings.at(-1) >= MIN_FPS) break;
    }
    const recovered = readings.at(-1) >= MIN_FPS;
    record(
      'frame rate settles after an edit',
      recovered,
      `${readings.join(' ')} fps, a second each (at least ${MIN_FPS} within ${RECOVER_S} s)`,
    );

    // Drawings renders the same without a GPU; Visualize does not and is covered by the tour.
    await app.run(click('button', 'Workspace: Modeling'));
    await sleep(300);
    await app.run(click('[role=menuitemradio]', 'Drawings', true));
    await app.until(
      'Drawings',
      `return document.querySelectorAll('.drawing-paper polyline').length > 0`,
      60_000,
    );
    await capture(app, 'window-3-drawings');
    await app.run(click('button', 'Workspace: Drawings'));
    await sleep(300);
    await app.run(click('[role=menuitemradio]', 'Modeling', true));
    await app.until('Modeling', IDLE);

    await app.run(click('button', 'Projects'));
    await app.until('the project list', `return !!document.querySelector('.tile__face')`, 30_000);
    await app.run('location.reload()');
    await sleep(1500);
    await app.until('the start page after a reload', LOADED);
    const afterReload = await app.run(`return document.querySelectorAll('.tile__face').length`);
    record('project survives a reload', afterReload >= 1, `${afterReload} project(s)`);
    await app.run(click('button', 'Settings'));
    await sleep(500);
    await capture(app, 'window-4-settings');
  } catch (error) {
    record('flow', false, String(error));
  } finally {
    await app.close();
  }

  // Restart the app and check persistence.
  try {
    await sleep(1500);
    app = await launch();
    await app.until('the start page after a restart', LOADED);
    const afterRestart = await app.run(`return document.querySelectorAll('.tile__face').length`);
    record('project survives a restart', afterRestart >= 1, `${afterRestart} project(s)`);
    await app.close();
  } catch (error) {
    record('restart', false, String(error));
  }

  const table = [
    '| Step | | Detail |',
    '| --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.step} | ${row.ok ? 'ok' : '**FAILED**'} | ${row.detail.replaceAll('|', '/')} |`,
    ),
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`, { flag: 'a' });
  }
  process.exit(rows.every((row) => row.ok) ? 0 : 1);
}

await main();
