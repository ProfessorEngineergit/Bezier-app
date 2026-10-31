/**
 * Fails on relative Markdown links (`[text](path)`, `[text]: path`) whose target does not exist.
 * Web links are not fetched and `#fragment`s are not resolved. Also fails on links from public
 * files into paths listed in `scripts/beta-exclude.txt` (private-only), and on oversized images
 * under docs/assets.
 *
 * Run:  pnpm check:links
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Directories with third-party Markdown or generated output. */
const SKIPPED = new Set(['node_modules', 'dist', 'target', 'playwright-report', 'test-results']);

/** Vendored Markdown. */
const VENDORED = ['packages/lessons/samples/'];

/** Paths that exist only in the private repository. */
const PRIVATE = (() => {
  try {
    return readFileSync(join(ROOT, 'scripts/beta-exclude.txt'), 'utf8')
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim())
      .filter((line) => line !== '');
  } catch {
    return [];
  }
})();

/** A path relative to the root with `/` separators, so the prefixes above also match on Windows. */
function fromRoot(path: string): string {
  return relative(ROOT, path).split(sep).join('/');
}

/** Whether a root-relative path is private. */
function isPrivate(rel: string): boolean {
  return PRIVATE.some((entry) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name) || entry.name.startsWith('.git')) continue;
    const full = join(dir, entry.name);
    // A `.vendored` file marks a folder of third-party Markdown.
    if (entry.isDirectory() && exists(join(full, '.vendored'))) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Returns the link targets in a document with their line numbers. */
export function linksIn(text: string): { target: string; line: number }[] {
  const found: { target: string; line: number }[] = [];
  let inFence = false;
  text.split('\n').forEach((content, index) => {
    if (content.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    // Ignore inline code.
    const plain = content.replace(/`[^`]*`/g, '');
    for (const match of plain.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (match[1] !== undefined) found.push({ target: match[1], line: index + 1 });
    }
    const reference = /^\s*\[[^\]]+\]:\s*(\S+)/.exec(plain);
    if (reference?.[1] !== undefined) found.push({ target: reference[1], line: index + 1 });
    // HTML attributes too: the README uses HTML for themed images and screenshot tables.
    for (const match of plain.matchAll(/\b(?:src|href|srcset)="([^"\s]+)"/g)) {
      if (match[1] !== undefined) found.push({ target: match[1], line: index + 1 });
    }
  });
  return found;
}

/** Returns the file a link points at, or null for URLs and page-local anchors. */
export function fileOf(target: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('//')) {
    return null;
  }
  // Strip editor line suffixes such as `file.tsx:76`.
  const path = (target.split('#')[0]?.split('?')[0] ?? '').replace(/:\d+(?::\d+)?$/, '');
  return path === '' ? null : decodeURIComponent(path);
}

/** Per-image size limit; images stay in git history permanently. */
const MAX_IMAGE_KB = 400;
/** Total size limit for docs/assets, to keep clones small. */
const MAX_ASSETS_MB = 12;

/** Checks image sizes under docs/assets. */
function assetProblems(): string[] {
  const problems: string[] = [];
  let total = 0;
  const visit = (dir: string): void => {
    if (!exists(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!/\.(png|webp|jpe?g|gif|svg)$/i.test(entry.name)) continue;
      const bytes = statSync(full).size;
      total += bytes;
      if (bytes > MAX_IMAGE_KB * 1024) {
        problems.push(
          `${relative(ROOT, full)} is ${Math.round(bytes / 1024)} KB; the limit is ${MAX_IMAGE_KB} KB (scripts/capture/optimise.mjs)`,
        );
      }
    }
  };
  visit(join(ROOT, 'docs/assets'));
  if (total > MAX_ASSETS_MB * 1024 * 1024) {
    problems.push(
      `docs/assets is ${(total / 1048576).toFixed(1)} MB; the limit is ${MAX_ASSETS_MB} MB`,
    );
  }
  return problems;
}

function main(): number {
  const problems: string[] = assetProblems();
  for (const file of walk(ROOT)) {
    const rel = fromRoot(file);
    if (VENDORED.some((prefix) => rel.startsWith(prefix))) continue;
    // Links are relative to the main repository's root; promote-stable.sh checks them there.
    if (rel.startsWith('scripts/main-repo/')) continue;
    const here = isPrivate(rel);
    for (const { target, line } of linksIn(readFileSync(file, 'utf8'))) {
      const path = fileOf(target);
      if (path === null) continue;
      // Absolute paths from a local machine.
      if (/^\/(Users|home)\//.test(path)) {
        problems.push(`${rel}:${line} links to ${target}, an absolute path on one machine`);
        continue;
      }
      const resolved = path.startsWith('/') ? join(ROOT, path) : resolve(dirname(file), path);
      if (!exists(resolved)) {
        problems.push(`${rel}:${line} links to ${target}, which does not exist`);
      } else if (!here && isPrivate(fromRoot(resolved))) {
        problems.push(
          `${rel}:${line} links to ${target}, which the public repositories do not contain`,
        );
      }
    }
  }
  for (const problem of problems) console.error(`error ${problem}`);
  if (problems.length > 0) console.error(`\n${problems.length} broken link(s).`);
  else console.log('Document links ok.');
  return problems.length > 0 ? 1 : 0;
}

// Compared as URLs: on Windows argv[1] is `C:\…` and the module URL `file:///C:/…`.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
