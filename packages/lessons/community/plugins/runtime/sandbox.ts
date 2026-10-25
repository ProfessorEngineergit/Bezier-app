/**
 * The document a plugin runs in.
 *
 * The frame has only `sandbox="allow-scripts"`: an opaque origin (no app storage, cookies or
 * IndexedDB), no popups, forms, top-level navigation or modal dialogs. Its CSP allows exactly one
 * script by hash (SDK plus plugin code) and blocks `eval`, `new Function`, loaded code and workers,
 * so only reviewed code runs. Connections are limited to the granted origins.
 */

import type { PluginManifest } from '../format/manifest.js';
import { SDK_SOURCE } from './sdk.js';

/** Design tokens passed into the frame so plugin panels can match Bezier's look. */
const TOKENS = [
  '--text',
  '--text-dim',
  '--text-faint',
  '--line',
  '--accent',
  '--text-on-accent',
  '--surface-control-glass',
  '--radius-control',
  '--pad',
  '--pad-sm',
  '--text-size',
  '--text-size-sm',
  '--font',
];

/**
 * Whether the code contains text that would end the inline script early, letting the plugin
 * inject HTML (e.g. a meta refresh) not covered by the hash.
 */
export function unsafeForInlineScript(code: string): boolean {
  return /<\/script|<!--/i.test(code);
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function themeCss(styles: Pick<CSSStyleDeclaration, 'getPropertyValue'>): string {
  const values = TOKENS.map((name) => {
    const value = styles
      .getPropertyValue(name)
      .trim()
      .replace(/[<>{};]/g, '');
    return value === '' ? '' : `${name}: ${value};`;
  }).join(' ');
  // A frame whose colour scheme differs from its parent gets an opaque background from the
  // browser, so pass the page's scheme in.
  const asked = styles.getPropertyValue('color-scheme').trim();
  const scheme = asked === 'dark' || asked === 'light' ? `color-scheme: ${asked};` : '';
  return `:root { ${scheme} ${values} } body { margin: 0; padding: var(--pad, 10px); color: var(--text); font: var(--text-size, 12px) / 1.45 var(--font, system-ui); background: transparent; }`;
}

export async function pluginDocument(
  manifest: PluginManifest,
  code: string,
  css: string,
): Promise<string> {
  if (unsafeForInlineScript(code)) throw new Error('unsafe inline code');
  // Wrapped in an async function so plugins can use top-level `await`.
  const script = `${SDK_SOURCE}\n;(async () => {\n"use strict";\n${code}\n})().catch((error) => console.error(error));\n`;
  const connect = manifest.permissions.includes('network')
    ? (manifest.network ?? []).join(' ') || "'none'"
    : "'none'";
  const policy = [
    "default-src 'none'",
    `script-src 'sha256-${await sha256Base64(script)}'`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    `connect-src ${connect}`,
    "worker-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>${css.replace(/</g, '')}</style></head><body><script>${script}</script></body></html>`;
}
