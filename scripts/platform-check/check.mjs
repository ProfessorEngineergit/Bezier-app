/**
 * Drives the installed desktop app through tauri-driver: intro film playback, detected machine
 * capabilities, and response times. Prints one line per check and a JSON summary.
 *
 *   tauri-driver &
 *   node scripts/platform-check/check.mjs /usr/bin/bezier-desktop
 *
 * Used by `run-fedora.sh`, or by hand on Linux or Windows with tauri-driver and the platform's
 * WebDriver (WebKitWebDriver, msedgedriver).
 */
const APP = process.argv[2];
const DRIVER = 'http://127.0.0.1:4444';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body) {
  const res = await fetch(DRIVER + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.value;
}
const results = {};
const say = (key, value) => {
  results[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const { sessionId: id } = await call('POST', '/session', {
  capabilities: { alwaysMatch: { 'tauri:options': { application: APP } } },
});
const run = (script) => call('POST', `/session/${id}/execute/sync`, { script, args: [] });
const runAsync = (script) => call('POST', `/session/${id}/execute/async`, { script, args: [] });
async function until(label, script, ms = 300_000) {
  const t = Date.now();
  for (;;) {
    if (await run(script).catch(() => false)) return Date.now() - t;
    if (Date.now() - t > ms) throw new Error(`timed out: ${label}`);
    await sleep(250);
  }
}
/** Directory for window screenshots; unset to skip them. */
const SHOTS = process.env.SHOTS;
async function shot(name) {
  if (SHOTS === undefined) return;
  const { writeFileSync } = await import('node:fs');
  const png = await call('GET', `/session/${id}/screenshot`).catch(() => null);
  if (png !== null) writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(png, 'base64'));
}
const t0 = Date.now();
try {
  // 1. Intro film, shown first on a fresh start.
  say(
    'film element',
    await until('the film', `return !!document.querySelector('.film video')`, 60_000)
      .then((ms) => `${ms} ms`)
      .catch((e) => String(e)),
  );
  // Sample for 12 s: it must start, advance, and not jump to the end.
  const film = [];
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    film.push(
      await run(
        `const v = document.querySelector('.film video'); if (!v) return 'gone'; return { t: Math.round(v.currentTime * 10) / 10, d: Math.round(v.duration * 10) / 10, ready: v.readyState, error: v.error && v.error.code, src: (v.currentSrc || '').split(':')[0] }`,
      ).catch(() => 'n/a'),
    );
  }
  say('film, a second at a time', film);
  await shot('1-film');
  const last = film.filter((x) => typeof x === 'object').at(-1);
  say('film plays', last !== undefined && last.t > 3 && last.t < last.d - 1 && last.error === null);
  say(
    'film decoders',
    await run(
      `const v = document.createElement('video'); return { webm: v.canPlayType('video/webm; codecs="vp9, opus"'), mp4: v.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"') }`,
    ),
  );
  // Skip the film from here on.
  await run(
    `localStorage.setItem('bezier.film.seen','x'); localStorage.setItem('bezier.preferences', JSON.stringify({ startPage: 'projects' })); localStorage.removeItem('bezier.nib.offered'); localStorage.setItem('bezier.nib', JSON.stringify({ met: false, guides: [] })); return true;`,
  );
  await run('location.reload(); return true;').catch(() => undefined);
  await sleep(2000);
  // 2. Machine capabilities as the app detects them.
  say(
    'start page',
    `${await until('start', `return !!document.querySelector('.library[data-loaded]')`)} ms`,
  );
  say(
    'machine',
    await run(
      `const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); return { softwarePaintHint: window.__bezierSoftwarePaint === true, paint: document.documentElement.dataset.paint, glass: document.documentElement.dataset.glass, webgl2: !!gl, webgpu: typeof navigator.gpu !== 'undefined', cores: navigator.hardwareConcurrency, dpr: devicePixelRatio, ua: navigator.userAgent.slice(-70) }`,
    ),
  );
  await run(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'New Project').click(); return true;`,
  );
  say(
    'editor',
    `${await until('editor', `return !!document.querySelector('canvas.viewport') && !document.documentElement.hasAttribute('data-busy')`)} ms`,
  );
  say(
    'view cube',
    await run(
      `return document.querySelector('.viewcube__canvas') ? 'canvas' : document.querySelector('.viewcube__face') ? 'dom' : 'none'`,
    ),
  );
  // 3. Nib's first-lesson offer.
  await sleep(4000);
  say(
    'nib',
    await run(
      `const i = document.querySelector('.nib-island'); return i ? { shape: i.dataset.shape, kind: i.dataset.kind, kicker: document.querySelector('.nib-island__kicker')?.textContent ?? null } : 'not there'`,
    ),
  );
  await run(
    `const later = [...document.querySelectorAll('.nib-island__action')].find((b) => b.textContent === 'Later'); later?.click(); return true;`,
  );
  await sleep(1500);
  // 4. Tool clicks, timed to the third frame after the click.
  const tools = {};
  for (const label of ['Sketch', 'Items', 'Quick settings', 'Transform', 'Tools']) {
    tools[label] = await runAsync(`const done = arguments[arguments.length - 1];
      const el = document.querySelector('.rail__icon[title="${label}"]');
      if (!el) return done('missing');
      const t0 = performance.now(); el.click();
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done(Math.round(performance.now() - t0)))));`);
    await sleep(1200);
    await run(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`,
    );
    await sleep(800);
    await run(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`,
    );
    await sleep(800);
  }
  say('tool click to third frame, ms', tools);
  // 5. A box, then the idle frame rate. Open Tools only if Extrude is not already visible.
  await run(
    `if (!document.querySelector('.rail__icon[title="Extrude"]')) [...document.querySelectorAll('.rail__icon')].find((b) => b.title === 'Tools').click(); return true;`,
  );
  await sleep(600);
  const boxAt = Date.now();
  await run(
    `[...document.querySelectorAll('.rail__icon')].find((b) => b.title === 'Extrude')?.click(); return true;`,
  );
  await until(
    'the box',
    `const c = document.querySelector('canvas.viewport'); return !!c && !!c.dataset.triangles && c.dataset.triangles !== '0'`,
    120_000,
  ).catch(() => undefined);
  say('box', `${Date.now() - boxAt} ms`);
  await sleep(1500);
  await shot('3-editor-box');
  await sleep(3000);
  say(
    'frames a second at rest',
    await runAsync(`const done = arguments[arguments.length - 1]; let n = 0; const t0 = performance.now();
    const tick = (t) => { n++; if (t - t0 > 3000) done(Math.round(10 * n / ((t - t0) / 1000)) / 10); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);`),
  );
} catch (error) {
  say('error', String(error));
} finally {
  await call('DELETE', `/session/${id}`).catch(() => undefined);
  say('total', `${Math.round((Date.now() - t0) / 1000)} s`);
  console.log(`SUMMARY ${JSON.stringify(results)}`);
}
