/**
 * Machine and app facts for a report, to tell problems specific to a GPU or browser engine apart.
 * Never about the user or project: no names, paths, model contents, address, or local time (only
 * the UTC offset). The window shows every line before sending, and the block is one toggle.
 */

import { VERSION } from '../version.js';

const FIRST_SEEN = 'bezier.firstSeen';
const STARTED = performance.now();

/** First run on this machine, stored on first call so later reports can say "since". */
function firstSeen(): number | null {
  try {
    const stored = window.localStorage.getItem(FIRST_SEEN);
    if (stored !== null && Number.isFinite(Number(stored))) return Number(stored);
    window.localStorage.setItem(FIRST_SEEN, String(Date.now()));
    return Date.now();
  } catch {
    return null;
  }
}

/** The GPU, as far as the browser reports it. */
function graphics(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl === null) return 'no WebGL';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    const version = canvas.getContext('webgl2') !== null ? 'WebGL 2' : 'WebGL 1';
    return `${renderer} (${version}, textures up to ${String(gl.getParameter(gl.MAX_TEXTURE_SIZE))})`;
  } catch {
    return 'unknown';
  }
}

function system(): string {
  const agent = navigator.userAgent;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const name = /Mac/.test(agent)
    ? 'macOS'
    : /Windows/.test(agent)
      ? 'Windows'
      : /Linux/.test(agent)
        ? 'Linux'
        : (data?.platform ?? 'Unknown');
  // Windows and Linux put a version in the user agent; macOS freezes it, so it is omitted there.
  const version = /Windows NT ([\d.]+)/.exec(agent)?.[1] ?? '';
  return version === '' ? name : `${name} ${version}`;
}

function engine(): string {
  const agent = navigator.userAgent;
  const chrome = /(?:Chrome|Chromium|Edg)\/([\d.]+)/.exec(agent)?.[1];
  if (chrome !== undefined) return `Chromium ${chrome}`;
  const firefox = /Firefox\/([\d.]+)/.exec(agent)?.[1];
  if (firefox !== undefined) return `Firefox ${firefox}`;
  const safari = /Version\/([\d.]+)/.exec(agent)?.[1];
  return safari === undefined ? 'unknown engine' : `WebKit (Safari ${safari})`;
}

function offset(): string {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const hours = Math.floor(Math.abs(minutes) / 60);
  return `UTC${sign}${String(hours)}`;
}

function megabytes(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${String(Math.round(bytes / 1024 ** 2))} MB`;
}

/**
 * Whether read files can be cached in the origin private file system as the kernel does
 * (`kernel/worker/opfs-shapes.ts`): created in a worker, written through the sync access handle.
 * Without it, every open of a large model rereads its file: ten seconds versus minutes.
 */
function keptFilesWork(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const code = `
        (async () => {
          try {
            const root = await navigator.storage.getDirectory();
            const handle = await root.getFileHandle('probe.tmp', { create: true });
            const how = handle.createWritable ? 'writable' : handle.createSyncAccessHandle ? 'sync handle' : 'no write';
            if (handle.createSyncAccessHandle) {
              const access = await handle.createSyncAccessHandle();
              access.write(new Uint8Array([1, 2, 3]), { at: 0 });
              access.flush();
              access.close();
            }
            await root.removeEntry('probe.tmp');
            postMessage('works (' + how + ')');
          } catch (error) {
            postMessage('fails: ' + error.name + ' ' + String(error.message).slice(0, 80));
          }
        })();`;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const worker = new Worker(url);
      const done = (text: string) => {
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(text);
      };
      worker.onmessage = (event) => done(String(event.data));
      worker.onerror = () => done('fails: the worker could not start');
      window.setTimeout(() => done('no answer in 5 s'), 5000);
    } catch (error) {
      resolve(`fails: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  });
}

/** Duration and location of the last project open, from the app's timings. */
function lastOpening(): string | null {
  const marks = performance
    .getEntriesByType('measure')
    .filter((m) => m.name.startsWith('bezier:') && m.duration >= 50)
    .slice(-12)
    .map((m) => `${m.name.slice(7)} ${(m.duration / 1000).toFixed(1)} s`);
  return marks.length === 0 ? null : marks.join(', ');
}

/** Facts about the open project, passed by the screen showing it: counts, never names. */
export type ProjectFacts = Readonly<Record<string, string | number>>;

export async function collectDiagnostics(facts: ProjectFacts = {}): Promise<string[]> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lines: string[] = [];
  const first = firstSeen();
  const desktop = '__TAURI_INTERNALS__' in window;
  lines.push(`App: Bezier ${VERSION}, ${desktop ? 'desktop app' : 'in a browser'}`);
  if (first !== null) {
    const days = Math.floor((Date.now() - first) / 86_400_000);
    lines.push(
      `First opened here: ${new Date(first).toISOString().slice(0, 10)} (${String(days)} days ago)`,
    );
  }
  lines.push(`Open for: ${String(Math.round((performance.now() - STARTED) / 60_000))} min`);
  lines.push(`System: ${system()}, ${engine()}`);
  lines.push(
    `Machine: ${String(nav.hardwareConcurrency)} cores${nav.deviceMemory === undefined ? '' : `, at least ${String(nav.deviceMemory)} GB memory`}`,
  );
  lines.push(`Graphics: ${graphics()}`);
  lines.push(
    `Screen: ${String(screen.width)}×${String(screen.height)} at ${String(window.devicePixelRatio)}×, window ${String(window.innerWidth)}×${String(window.innerHeight)}`,
  );
  lines.push(
    `Settings of the system: ${navigator.language}, ${offset()}, ${
      matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }${matchMedia('(prefers-reduced-motion: reduce)').matches ? ', reduced motion' : ''}`,
  );
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.usage !== undefined && estimate.quota !== undefined)
      lines.push(
        `Storage: ${megabytes(estimate.usage)} used of ${megabytes(estimate.quota)} allowed`,
      );
    const persisted = await navigator.storage.persisted();
    lines.push(`Storage kept when space is short: ${persisted ? 'yes' : 'no'}`);
  } catch {
    lines.push('Storage: not available');
  }
  lines.push(`Kept files: ${await keptFilesWork()}`);
  const opening = lastOpening();
  if (opening !== null) lines.push(`Last timings: ${opening}`);
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (heap !== undefined) lines.push(`Page memory: ${megabytes(heap.usedJSHeapSize)}`);
  for (const [name, value] of Object.entries(facts)) lines.push(`${name}: ${String(value)}`);
  return lines;
}
