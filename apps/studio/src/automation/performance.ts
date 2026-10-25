/**
 * App performance on demand: frame rate over a short window, where recent edits spent their time,
 * and machine info. Edits are already timed as `bezier:*` User Timing measures (trace.ts). Frame
 * rate uses requestAnimationFrame because that is the rate the user sees.
 */

import { live } from './live.js';

interface Memory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export async function measurePerformance(sampleMs: number) {
  const frames: number[] = [];
  await new Promise<void>((done) => {
    const start = performance.now();
    let last = start;
    const tick = (now: number) => {
      frames.push(now - last);
      last = now;
      if (now - start < sampleMs) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(tick);
    });
  });
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q: number) =>
    round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);
  const total = frames.reduce((sum, ms) => sum + ms, 0);

  const memory = (performance as Performance & { memory?: Memory }).memory;
  const view = live.view;
  const prefs = live.prefs;
  return {
    frames: {
      // The page draws only on change, so a still view reports few frames; this is the rate the
      // browser offered, the most the view could have had.
      fps: total === 0 ? 0 : round((frames.length * 1000) / total),
      p50Ms: at(0.5),
      p95Ms: at(0.95),
      maxMs: round(sorted.at(-1) ?? 0),
      over33Ms: frames.filter((ms) => ms > 33.4).length,
      sampled: frames.length,
    },
    recentWork: measures(),
    model:
      view === null
        ? null
        : {
            steps: view.document.features.length,
            bodies: view.bodies.length,
            triangles: view.display === null ? 0 : view.display.mesh.indices.length / 3,
            lastRebuildMs: round(view.durationMs),
          },
    drawing:
      prefs === null
        ? null
        : { quality: prefs.quality, detail: prefs.detail, smoothness: prefs.smoothness },
    machine: {
      cores: navigator.hardwareConcurrency,
      memoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      gpu: gpuName(),
      devicePixelRatio,
      heapMB: memory === undefined ? null : round(memory.usedJSHeapSize / 1e6),
      heapLimitMB: memory === undefined ? null : round(memory.jsHeapSizeLimit / 1e6),
    },
  };
}

/** Per kind of timed work: count, mean, max and latest duration. */
function measures() {
  const byName = new Map<string, number[]>();
  for (const entry of performance.getEntriesByType('measure')) {
    if (!entry.name.startsWith('bezier:')) continue;
    const name = entry.name.slice(7);
    byName.set(name, [...(byName.get(name) ?? []), entry.duration]);
  }
  return [...byName]
    .map(([name, times]) => ({
      name,
      count: times.length,
      meanMs: round(times.reduce((sum, ms) => sum + ms, 0) / times.length),
      maxMs: round(Math.max(...times)),
      lastMs: round(times.at(-1) ?? 0),
    }))
    .sort((a, b) => b.maxMs - a.maxMs);
}

let gpu: string | null | undefined;

function gpuName(): string | null {
  if (gpu !== undefined) return gpu;
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  gpu = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return gpu;
}

const round = (value: number) => Math.round(value * 10) / 10;
