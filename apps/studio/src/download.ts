/**
 * Saves a finished file. In a browser, an object-URL link. In the desktop app, a native save panel
 * via the shell: the webview's download handler runs on the UI thread, and a modal panel opened
 * from there deadlocks the window. All exports, captures and drawings go through here for that
 * reason.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

/** Well under the argument limit of `String.fromCharCode`. */
const CHUNK = 0x8000;

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  return btoa(binary);
}

const blobOf = (data: BlobPart, type: string): Blob =>
  data instanceof Blob ? data : new Blob([data], { type });

/**
 * Saves a file and returns where it went, or null if cancelled. Rejects only when the file could
 * not be written.
 */
export async function save(data: BlobPart, name: string, type: string): Promise<string | null> {
  if (!isTauri()) {
    const url = URL.createObjectURL(blobOf(data, type));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    // Revoking immediately can cancel the transfer.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return name;
  }
  const bytes = new Uint8Array(await blobOf(data, type).arrayBuffer());
  return invoke<string | null>('save_file', { name, data: base64(bytes) });
}

/** Saves a file without waiting, for callers with nowhere to report errors. */
export function download(data: BlobPart, name: string, type: string): void {
  void save(data, name, type).catch((error: unknown) => {
    console.error('The file could not be saved', error);
  });
}
