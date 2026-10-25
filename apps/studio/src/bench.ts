/**
 * Frame-budget benchmark for the webview (ADR 0007: 8 ms each for camera movement and hover). The
 * desktop build renders in the OS webview, not Chromium, and this checks that it holds the budget.
 * Results go into the DOM so the page works in a browser and in a native window.
 *
 * The load is swept, not fixed: a renderer under load speeds up when given less, one capped at the
 * refresh interval does not. The frame gap is shown next to CPU time because `render()` only queues
 * commands, so CPU time alone can look fine while frames are missed.
 *
 * Run: `pnpm --filter @bezier/studio dev`, then open /bench.html
 */

import { faceRef, type StableRef } from '@bezier/core';
import type { Mesh } from '@bezier/kernel';
import { createViewport, type Viewport } from '@bezier/renderer';
import { invalidity } from './bench-validity.js';

/** Straight from ADR 0007. */
const HOVER_BUDGET_MS = 8;
/** Below 60 fps, motion is visibly not smooth. */
const FRAME_GAP_60_HZ = 1000 / 60;

const GRIDS = [24, 80, 160, 320];
const FACE_COUNT = 256;
const ORBIT_FRAMES = 120;
const PICK_SAMPLES = 200;

/**
 * A displaced surface grouped into faces. Synthetic rather than built through OCCT so kernel
 * variance stays out of the renderer measurement. A flat sheet would give the BVH nothing to
 * separate and flatter the pick timings.
 */
function surface(grid: number): Mesh {
  const side = grid + 1;
  const positions = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);

  for (let y = 0; y <= grid; y++) {
    for (let x = 0; x <= grid; x++) {
      const at = (y * side + x) * 3;
      const wx = (x / grid - 0.5) * 200;
      const wy = (y / grid - 0.5) * 200;
      positions[at] = wx;
      positions[at + 1] = wy;
      positions[at + 2] = Math.sin(wx * 0.08) * Math.cos(wy * 0.08) * 18;
      normals[at + 2] = 1;
    }
  }

  const quads = grid * grid;
  const indices = new Uint32Array(quads * 6);
  const triangleFaces = new Uint32Array(quads * 2);
  const perFace = Math.max(1, Math.ceil(quads / FACE_COUNT));

  let quad = 0;
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const a = y * side + x;
      const c = a + side;
      indices[quad * 6] = a;
      indices[quad * 6 + 1] = c;
      indices[quad * 6 + 2] = a + 1;
      indices[quad * 6 + 3] = a + 1;
      indices[quad * 6 + 4] = c;
      indices[quad * 6 + 5] = c + 1;

      const face = Math.floor(quad / perFace);
      triangleFaces[quad * 2] = face;
      triangleFaces[quad * 2 + 1] = face;
      quad++;
    }
  }

  return { positions, normals, indices, triangleFaces };
}

interface Row {
  triangles: number;
  cpu: number;
  gap: number;
  pick: number;
  hitRate: string;
  /** Why this row measures nothing, or null when it holds. */
  invalid: string | null;
}

function percentile(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[at] ?? Number.NaN;
}

function frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function measure(viewport: Viewport, canvas: HTMLCanvasElement, grid: number): Promise<Row> {
  const mesh = surface(grid);
  const refs: StableRef[] = [];
  for (let i = 0; i < FACE_COUNT; i++) refs.push(faceRef('bench', `f${i}`));

  viewport.setGeometry({ mesh, edges: null, faceRefs: refs });
  viewport.zoomToFit();

  // The first frames pay for buffer upload and shader compilation, which is not a per-frame cost.
  for (let i = 0; i < 20; i++) await frame();

  const box = canvas.getBoundingClientRect();

  // Orbit through the viewport API, as the view cube does. Synthetic pointer events do not work: a
  // left press is selection under every preset, and a right press has no real pointer to capture.
  viewport.resetFrameTimes();
  const gaps: number[] = [];
  let turned = 0;
  let previous = performance.now();
  for (let i = 0; i < ORBIT_FRAMES; i++) {
    const before = viewport.cameraView().position;
    viewport.orbit((Math.PI * 2) / ORBIT_FRAMES, Math.sin((i / ORBIT_FRAMES) * Math.PI * 2) * 0.01);
    const after = viewport.cameraView().position;
    if (before.some((value, axis) => value !== after[axis])) turned++;
    await frame();
    const now = performance.now();
    gaps.push(now - previous);
    previous = now;
  }
  const drawn = viewport.frameTimes();

  const picks: number[] = [];
  let hits = 0;
  for (let i = 0; i < PICK_SAMPLES; i++) {
    const t = i / PICK_SAMPLES;
    const x = box.width / 2 + Math.cos(t * Math.PI * 12) * t * box.width * 0.45;
    const y = box.height / 2 + Math.sin(t * Math.PI * 12) * t * box.height * 0.45;

    const started = performance.now();
    if (viewport.pick(x, y, 'any') !== null) hits++;
    picks.push(performance.now() - started);
  }

  const row = {
    triangles: mesh.triangleFaces.length,
    cpu: percentile(drawn, 0.95),
    gap: percentile(gaps, 0.95),
    pick: percentile(picks, 0.95),
    // A missed pick returns almost at once, so the hit rate is needed to read the average.
    hitRate: `${Math.round((hits / PICK_SAMPLES) * 100)}%`,
  };
  return { ...row, invalid: invalidity(ORBIT_FRAMES, turned, drawn.length, row) };
}

async function main(): Promise<void> {
  const canvas = document.querySelector('canvas');
  const output = document.querySelector('#results');
  if (canvas === null || output === null) throw new Error('bench.html is missing its elements');

  const viewport = createViewport({ canvas });
  viewport.resize(canvas.clientWidth, canvas.clientHeight);

  const rows: Row[] = [];
  for (const grid of GRIDS) {
    output.textContent = `measuring ${(grid * grid * 2).toLocaleString()} triangles…`;
    rows.push(await measure(viewport, canvas, grid));
    report(output, rows, false);
  }
  report(output, rows, true);
}

function report(into: Element, rows: readonly Row[], done: boolean): void {
  const grade = (value: number, budget: number) =>
    Number.isFinite(value)
      ? `<td class="${value <= budget ? 'ok' : 'over'}">${value.toFixed(2)}</td>`
      : '<td class="over">–</td>';

  const body = rows
    .map(
      (row) =>
        `<tr data-triangles="${row.triangles}" data-gap="${row.gap.toFixed(2)}">` +
        `<td>${row.triangles.toLocaleString()}</td>` +
        grade(row.cpu, HOVER_BUDGET_MS) +
        grade(row.gap, FRAME_GAP_60_HZ) +
        grade(row.pick, HOVER_BUDGET_MS) +
        `<td>${row.hitRate}</td>` +
        `<td class="${row.invalid === null ? 'ok' : 'over'}">${row.invalid ?? 'valid'}</td></tr>`,
    )
    .join('');

  // If the gap barely moves while the load grows by two orders of magnitude, the renderer is
  // capped, not struggling. Only reported when every row is valid.
  const invalid = rows.filter((row) => row.invalid !== null);
  const first = rows[0]?.gap ?? 0;
  const last = rows[rows.length - 1]?.gap ?? 0;
  const flat = rows.length > 1 && last < first * 1.5;

  into.innerHTML =
    '<table><thead><tr><th>triangles</th><th>cpu p95</th><th>frame gap p95</th>' +
    `<th>pick p95</th><th>hits</th><th>run</th></tr></thead><tbody>${body}</tbody></table>` +
    `<p class="agent">${navigator.userAgent}</p>` +
    (done
      ? `<p id="verdict">${
          invalid.length > 0
            ? `INVALID — ${invalid.length} of ${rows.length} runs measured nothing; no verdict.`
            : flat
              ? 'FLAT — the gap barely moves with load: a refresh cap, not a limit on how much this engine can draw.'
              : 'SCALES — the gap grows with load: a real rendering limit.'
        }</p>`
      : '<p>measuring…</p>');
}

main().catch((error: unknown) => {
  const output = document.querySelector('#results');
  if (output !== null) output.textContent = `bench failed: ${String(error)}`;
});
