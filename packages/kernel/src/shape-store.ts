/**
 * Cache for imported shapes as binary BREP, which reads about forty times faster than STEP (the
 * Voron: 56 s from STEP, 1.4 s from 123 MB of BREP, same face order; occt-wasm 5.3.5). The host
 * provides storage: OPFS in the browser (`worker/opfs-shapes.ts`), a Map in tests.
 */

export interface ShapeStore {
  read(key: string): Promise<Uint8Array | null>;
  /** Stores `parts` in sequence under `key`, so a large shape is never copied into one buffer. */
  write(key: string, parts: readonly Uint8Array[]): Promise<void>;
}

/**
 * Part of every key; change it on kernel upgrades. A BREP from another OCCT build can abort the
 * engine instead of failing cleanly.
 */
const FORMAT = 'occt-wasm-5.3.5-brep-bin-1';

/** Bytes of SHA-256 at the front of every entry. */
const CHECK_BYTES = 32;

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/**
 * A file's store key: a 128-bit hash of the text's characters plus its length, and the kernel
 * format. Not SHA-256, which would need an encoded copy of a text up to 250 MB; the stored
 * checksum guards against damage.
 */
export function keyOf(text: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const words = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1];
  const hash = words.map((word) => (word >>> 0).toString(16).padStart(8, '0')).join('');
  return `${FORMAT}-${text.length.toString(36)}-${hash}`;
}

/**
 * `keyOf`, memoized for the last few texts. The single digest of an imported file, shared by the
 * rebuild cache (core `params.ts`), undo history (studio `session-history.ts`) and this store.
 * Lookup by the same string is cheap; only a few are kept since each holds its text alive.
 */
export function textKey(text: string): string {
  const found = known.get(text);
  if (found !== undefined) return found;
  const key = keyOf(text);
  known.set(text, key);
  if (known.size > 4) {
    const oldest = known.keys().next().value;
    if (oldest !== undefined) known.delete(oldest);
  }
  return key;
}

const known = new Map<string, string>();

/**
 * Records a digest computed elsewhere (studio `load-document.ts`). Must be the `keyOf` of the
 * same text.
 */
export function rememberTextKey(text: string, key: string): void {
  known.set(text, key);
  if (known.size > 4) {
    const oldest = known.keys().next().value;
    if (oldest !== undefined) known.delete(oldest);
  }
}

/** A shape's bytes as they are stored: their checksum, then the bytes. */
export async function sealed(bytes: Uint8Array): Promise<readonly Uint8Array[]> {
  // Digest wants its own ArrayBuffer; a view onto shared memory is copied.
  const brep =
    bytes.buffer instanceof ArrayBuffer
      ? (bytes as Uint8Array<ArrayBuffer>)
      : new Uint8Array(bytes);
  return [await sha256(brep), brep];
}

/**
 * The shape's bytes, or null when the entry does not match its checksum. Checked before OCCT sees
 * it: damaged input to `fromBREPBinary` aborts the worker, and every restart would hit it again.
 */
export async function opened(entry: Uint8Array): Promise<Uint8Array<ArrayBuffer> | null> {
  if (entry.length <= CHECK_BYTES) return null;
  // A view, not a copy: the entry is already a fresh buffer of its own.
  const brep =
    entry.buffer instanceof ArrayBuffer
      ? (entry as Uint8Array<ArrayBuffer>).subarray(CHECK_BYTES)
      : entry.slice(CHECK_BYTES);
  const expected = entry.subarray(0, CHECK_BYTES);
  const actual = await sha256(brep);
  for (let i = 0; i < CHECK_BYTES; i++) if (actual[i] !== expected[i]) return null;
  return brep;
}
