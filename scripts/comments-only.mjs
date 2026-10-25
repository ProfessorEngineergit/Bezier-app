// Checks that the working tree differs from a base ref only in comments.
//
//   node scripts/comments-only.mjs <base-ref>
//
// TS/JS/JSX are compared as esbuild output (formatting ignored); CSS and Rust with comments
// stripped by a string-aware scanner (`///` counts as a comment). Exits 1 if any code differs.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

// esbuild is not a root dependency; fall back to the copy Vite pulls into the pnpm store.
const require = createRequire(import.meta.url);
function loadEsbuild() {
  try {
    return require('esbuild');
  } catch {
    const store = join(process.cwd(), 'node_modules/.pnpm');
    const found = readdirSync(store).find((name) => name.startsWith('esbuild@'));
    if (!found) throw new Error('esbuild is not installed; run pnpm install first');
    return require(join(store, found, 'node_modules/esbuild'));
  }
}
const { transformSync } = loadEsbuild();

const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/comments-only.mjs <base-ref>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const changed = git('diff', '--name-only', '--diff-filter=M', base).split('\n').filter(Boolean);

const LOADERS = { '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.jsx': 'jsx' };

/** Returns the code without comments or formatting, as esbuild prints it. */
function codeOfScript(path, text) {
  return transformSync(text, {
    loader: LOADERS[extname(path)],
    minifyWhitespace: true,
    legalComments: 'none',
    sourcefile: path,
  }).code;
}

/** Removes comments outside strings. `style` is 'c' (block comments only) or 'rust'. */
function stripComments(text, style) {
  let out = '';
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"' || (style === 'rust' && c === "'" && /[^a-zA-Z_]/.test(text[i + 2] ?? ''))) {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (style === 'rust' && c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else {
      out += c;
      i++;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function codeOf(path, text) {
  const extension = extname(path);
  if (extension in LOADERS) return codeOfScript(path, text);
  if (extension === '.css') return stripComments(text, 'c');
  if (extension === '.rs') return stripComments(text, 'rust');
  return null;
}

let different = 0;
let compared = 0;
for (const path of changed) {
  let before;
  try {
    before = git('show', `${base}:${path}`);
  } catch {
    continue;
  }
  const now = readFileSync(path, 'utf8');
  const a = codeOf(path, before);
  if (a === null) {
    console.log(`not compared (kind of file): ${path}`);
    continue;
  }
  compared++;
  if (a !== codeOf(path, now)) {
    different++;
    console.log(`CODE CHANGED: ${path}`);
  }
}
console.log(`${compared} files compared, ${different} with changed code.`);
process.exit(different === 0 ? 0 : 1);
