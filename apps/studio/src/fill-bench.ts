/**
 * Frame cost against drawing-buffer size. A wide Retina monitor (3440 × 1440 at 2×) needs almost
 * twenty million pixels a frame, twice a 4K screen, each shaded several times with antialiasing.
 * This turns a heavy mesh at fixed pixel ratios and reports GPU time per frame, to choose the
 * viewport resolution by measurement.
 *
 * GPU time is measured by stalling: a one-pixel `readPixels` after the draw waits for the GPU to
 * finish the frame. Too costly for the app, hence this page.
 *
 * Run: `pnpm --filter @bezier/studio dev`, then open /fill-bench.html in a window of the size in
 * question.
 */

import { faceRef, type StableRef } from '@bezier/core';
import type { Mesh } from '@bezier/kernel';
import { createViewport, setMotionPreference } from '@bezier/renderer';

// `?reverse` measures smallest first, to tell warm-up from real cost.
const RATIOS = new URLSearchParams(location.search).has('reverse')
  ? [1, 1.25, 1.5, 2]
  : [2, 1.5, 1.25, 1];
const FRAMES = 90;
const GRID = 1000;

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
  let quad = 0;
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const a = y * side + x;
      const c = a + side;
      indices.set([a, c, a + 1, a + 1, c, c + 1], quad * 6);
      triangleFaces[quad * 2] = quad % 256;
      triangleFaces[quad * 2 + 1] = quad % 256;
      quad++;
    }
  }
  return { positions, normals, indices, triangleFaces };
}

const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

function percentile(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? Number.NaN;
}

async function measure(ratio: number | null, mesh: Mesh, refs: StableRef[]) {
  const old = document.querySelector('canvas');
  const canvas = document.createElement('canvas');
  old?.replaceWith(canvas);
  // null: the screen's own ratio, adapted while moving as in the app.
  const viewport = createViewport(ratio === null ? { canvas } : { canvas, pixelRatio: ratio });
  viewport.resize(canvas.clientWidth, canvas.clientHeight);
  viewport.setGeometry({ mesh, edges: null, faceRefs: refs });
  viewport.zoomToFit();
  const gl = canvas.getContext('webgl2');
  if (gl === null) throw new Error('no WebGL2');
  const pixel = new Uint8Array(4);
  for (let i = 0; i < 30; i++) await frame();

  const gpu: number[] = [];
  const gaps: number[] = [];
  const widths = new Set<number>();
  let last = await frame();
  for (let i = 0; i < FRAMES; i++) {
    viewport.orbit(0.02, 0.004);
    const now = await frame();
    // The viewport's frame callback has already drawn.
    const before = performance.now();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gpu.push(performance.now() - before + (before - now));
    gaps.push(now - last);
    widths.add(canvas.width);
    last = now;
  }
  viewport.dispose?.();
  return {
    ratio: ratio ?? `adaptive, widths ${[...widths].join('/')}`,
    pixels: canvas.width * canvas.height,
    gpuP50: percentile(gpu, 0.5),
    gpuP95: percentile(gpu, 0.95),
    gapP50: percentile(gaps, 0.5),
  };
}

async function main() {
  const out = document.querySelector('#results');
  if (out === null) return;
  const mesh = surface(GRID);
  const refs: StableRef[] = [];
  for (let i = 0; i < 256; i++) refs.push(faceRef('bench', `f${i}`));
  const rows = [];
  // `?adaptive=0.5`: the app's own adaptation at that preference, not fixed ratios.
  const adaptive = new URLSearchParams(location.search).get('adaptive');
  if (adaptive !== null) {
    setMotionPreference(Number(adaptive));
    rows.push(await measure(null, mesh, refs));
  } else {
    for (const ratio of RATIOS) {
      out.textContent = `measuring at ${ratio}×…`;
      rows.push(await measure(ratio, mesh, refs));
    }
  }
  out.innerHTML = `<p>${innerWidth} × ${innerHeight} points, ${(mesh.triangleFaces.length / 1e6).toFixed(1)} M triangles</p><table><tr><th>ratio</th><th>megapixels</th><th>GPU p50 ms</th><th>GPU p95 ms</th><th>gap p50 ms</th></tr>${rows
    .map(
      (row) =>
        `<tr><td>${row.ratio}</td><td>${(row.pixels / 1e6).toFixed(1)}</td><td>${row.gpuP50.toFixed(1)}</td><td>${row.gpuP95.toFixed(1)}</td><td>${row.gapP50.toFixed(1)}</td></tr>`,
    )
    .join('')}</table><p id="verdict" data-done="">done</p>`;
  (window as unknown as { fillResults: unknown }).fillResults = rows;
}

void main();
