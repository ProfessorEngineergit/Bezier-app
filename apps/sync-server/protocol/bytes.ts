/**
 * Byte helpers shared by server and client. WebCrypto and fetch exist in both the browser and
 * Node 22, so the protocol runs unchanged on either side with no dependency at all.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** URL-safe base64 without padding, so values can sit in paths, headers and link fragments. */
export function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromB64(text: string): Uint8Array {
  const std = text.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Copies into a buffer of exactly the view's length. Node hands out views over larger pooled
 * buffers, which TypeScript does not accept as a `BufferSource`.
 */
export function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Ids, refs and etags are lowercase hex of a fixed length. Anything else never reaches disk. */
export function isHexId(text: string, length: number): boolean {
  return text.length === length && /^[0-9a-f]+$/.test(text);
}
