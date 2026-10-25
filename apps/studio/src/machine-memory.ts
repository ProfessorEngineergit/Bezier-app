/**
 * The machine's memory, and whether a STEP file is likely to fit. Pages cannot tell (Chromium and
 * WebView2 cap at 8 GB, WebKit reports nothing), so the desktop app asks the OS (`memory.rs`) and
 * stores it for import planning (`background-import.ts`). In a browser it stays unknown and no
 * warning is shown.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Peak memory of a STEP import per byte of file: the Voron's 241 MB peaked at 8.3 to 9.6 GB on a
 * Mac, about forty times.
 */
const PEAK_PER_BYTE = 40;
/** Share of memory an import may take, leaving room for the OS and the rest of the app. */
const SHARE = 0.75;

let known: number | null = null;

/** Asks the desktop app once, at start. */
export async function learnMachineMemory(): Promise<void> {
  if (!isTauri()) return;
  try {
    const bytes = await invoke<number | null>('machine_memory');
    if (typeof bytes !== 'number' || !(bytes > 0)) return;
    known = bytes;
    (globalThis as { __bezierMemoryBytes?: number }).__bezierMemoryBytes = bytes;
  } catch {
    // Older shell without the command: treat as a browser.
  }
}

const gigabytes = (bytes: number) =>
  `${(bytes / 2 ** 30).toFixed(bytes < 10 * 2 ** 30 ? 1 : 0)} GB`;

/**
 * Whether a STEP file of `size` bytes likely needs more memory than the machine has, with both
 * amounts in words; null when it fits or memory is unknown.
 */
export function importTooLarge(size: number): { need: string; have: string } | null {
  if (known === null) return null;
  const need = size * PEAK_PER_BYTE;
  return need > known * SHARE ? { need: gigabytes(need), have: gigabytes(known) } : null;
}
