/**
 * Automated checks on uploaded plugins before human review.
 *
 * Refusals cover things no plugin needs that would let unreviewed code run: evaluating strings,
 * loading code, reaching outside the frame, minified source. Findings are legitimate but flagged
 * for the reviewer.
 *
 * These patterns assist review and can be evaded; they are not the security boundary. The sandbox
 * is: opaque origin, hash-only script CSP, granted origins only, and stopping frames that navigate.
 */

import { checkText } from '../../server/text-filter.js';
import { PLUGIN_LIMITS } from '../format/manifest.js';
import { type PluginPackage, readPluginPackage, writePluginPackage } from '../format/package.js';
import { unsafeForInlineScript } from '../runtime/sandbox.js';

export class Refused extends Error {}

const FORBIDDEN: [RegExp, string][] = [
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\b|\bFunction\s*\(/, 'the Function constructor'],
  [/\bimport\s*\(/, 'dynamic import'],
  [/\bimportScripts\b|\bnew\s+Worker\b|\bSharedWorker\b/, 'workers or imported scripts'],
  [/\bWebAssembly\b/, 'WebAssembly'],
  [/\b(?:window|self|globalThis)\s*\.\s*(?:top|parent|opener|frames)\b/, 'other windows'],
  [/\bdocument\s*\.\s*cookie\b/, 'cookies'],
  [
    /\b(?:window|self|globalThis|document)\s*\.\s*location\s*=|\blocation\s*\.\s*(?:href\s*=|assign\s*\(|replace\s*\()/,
    'navigation',
  ],
];

/**
 * Zero-width and direction marks, supplementary variation selectors and tag characters. Plain
 * variation selectors (U+FE0F after an emoji) are common and allowed.
 */
const INVISIBLE =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E01EF}]/u;

const NETWORK =
  /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bnavigator\s*\.\s*sendBeacon\b/;

const FLAGS: [RegExp, string][] = [
  [/\batob\s*\(|\bString\s*\.\s*fromCharCode\b/, 'decodes text at run time'],
  [/(?:\\x[0-9a-f]{2}){8,}|(?:\\u[0-9a-f]{4}){8,}/i, 'long escaped strings'],
  [/["'`][^"'`\n]{500,}["'`]/, 'a very long string literal'],
  [/\bpostMessage\b/, 'posts messages itself'],
  [
    /\bbezier\s*\.\s*project\s*\.\s*read\b[\s\S]*\bfetch\s*\(/,
    'reads the model and uses the network',
  ],
];

export interface Reviewed {
  plugin: PluginPackage;
  bytes: Uint8Array;
  findings: string[];
}

export async function reviewUpload(
  bytes: Uint8Array,
  blocklist: readonly string[],
): Promise<Reviewed> {
  let plugin: PluginPackage;
  try {
    plugin = await readPluginPackage(bytes);
  } catch (error) {
    throw new Refused(error instanceof Error ? error.message : 'This plugin cannot be read.');
  }
  const { manifest, code } = plugin;
  for (const [text, field] of [
    [manifest.name, 'name'],
    [manifest.description, 'description'],
  ] as const) {
    const problem = checkText(text, blocklist, field);
    if (problem !== null) throw new Refused(problem);
  }
  if (code.includes('\u0000')) throw new Refused('main.js must be text.');
  // Invisible characters can hide a payload from a reviewer, as in the GlassWorm extensions. Plugin
  // code never needs them.
  const hidden = code.search(INVISIBLE);
  if (hidden !== -1) {
    const line = code.slice(0, hidden).split('\n').length;
    throw new Refused(
      `Line ${line} of main.js holds an invisible character. Remove it, or write it as an escape such as \\u200d.`,
    );
  }
  if (unsafeForInlineScript(code)) {
    throw new Refused('main.js may not contain “</script” or “<!--”. Split the string.');
  }
  const long = code.split('\n').findIndex((line) => line.length > PLUGIN_LIMITS.lineLength);
  if (long !== -1) {
    throw new Refused(
      `Line ${long + 1} of main.js is over ${PLUGIN_LIMITS.lineLength} characters. Upload readable source, not minified code.`,
    );
  }
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(code)) throw new Refused(`Plugins may not use ${what}.`);
  }
  if (!manifest.permissions.includes('network') && NETWORK.test(code)) {
    throw new Refused('main.js connects to the network without asking for the network permission.');
  }
  const findings = FLAGS.filter(([pattern]) => pattern.test(code)).map(([, what]) => what);
  if (manifest.permissions.includes('project:read') && manifest.permissions.includes('network')) {
    findings.push('can send the model to ' + (manifest.network ?? []).join(', '));
  }
  // Repackage so the stored package contains only the known files.
  return { plugin, bytes: await writePluginPackage(plugin), findings };
}
