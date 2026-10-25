/**
 * Enforces the layout rules in docs/contributing/conventions.md: required package files, file
 * size limits and file naming. Runs in CI.
 *
 * Run:  pnpm check:structure
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/**
 * Line limits: warn above SOFT_LIMIT, fail above HARD_LIMIT. They exist to catch a file that holds
 * two concepts; split by concept, not by size. If a file over the limit is genuinely one concept,
 * raise the limit. `apps/studio/src/App.tsx` (the composition root) is why HARD_LIMIT is 1000.
 */
const SOFT_LIMIT = 550;
const HARD_LIMIT = 1000;

/** Files every package must have. */
const REQUIRED_PACKAGE = ['README.md', 'package.json', 'tsconfig.json', 'src/index.ts'];

/** Apps are entered through a bundler, not imported, so they have no index.ts. */
const REQUIRED_APP = ['README.md', 'package.json', 'tsconfig.json'];

/** Native wrappers such as `apps/desktop` have no TypeScript, so no tsconfig.json. */
const REQUIRED_NATIVE_APP = ['README.md', 'package.json'];
const NATIVE_MARKER = 'src-tauri';

/**
 * Exempt from the naming rules (still subject to size limits and required files).
 * `packages/lessons` started as a separate project with its own conventions.
 */
const KEEPS_OWN_NAMES = ['packages/lessons/'];

/** Bundler entry points, exempt from the naming rules. */
const ENTRY_POINTS = new Set(['main', 'worker-entry']);

const problems: string[] = [];
const warnings: string[] = [];

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Required files.

const packageDirs = readdirSync(join(ROOT, 'packages'))
  .map((n) => join(ROOT, 'packages', n))
  .filter((p) => statSync(p).isDirectory());

const appDirs = readdirSync(join(ROOT, 'apps'))
  .map((n) => join(ROOT, 'apps', n))
  .filter((p) => statSync(p).isDirectory());

for (const [dirs, required] of [
  [packageDirs, REQUIRED_PACKAGE],
  [appDirs, REQUIRED_APP],
] as const) {
  for (const dir of dirs) {
    const wanted = exists(join(dir, NATIVE_MARKER)) ? REQUIRED_NATIVE_APP : required;
    for (const file of wanted) {
      if (!exists(join(dir, file))) {
        problems.push(`${relative(ROOT, dir)} is missing ${file}`);
      }
    }
  }
}

const allDirs = [...packageDirs, ...appDirs];

// File size and naming.

const sourceFiles = allDirs
  .flatMap((dir) => (exists(join(dir, 'src')) ? walk(join(dir, 'src')) : []))
  .filter((f) => ['.ts', '.tsx'].includes(extname(f)));

for (const file of sourceFiles) {
  const rel = relative(ROOT, file);
  const name = basename(file, extname(file));
  // Generated files are exempt.
  if (name.endsWith('.generated')) continue;
  const isTest = name.endsWith('.test');
  const isComponent = extname(file) === '.tsx';

  // Long test files are usually fine, and splitting them tends to hide coverage.
  if (!isTest) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (lines > HARD_LIMIT) {
      problems.push(`${rel} is ${lines} lines (limit ${HARD_LIMIT}). Split it by concept.`);
    } else if (lines > SOFT_LIMIT) {
      warnings.push(`${rel} is ${lines} lines (soft limit ${SOFT_LIMIT}). Consider splitting.`);
    }
  }

  if (KEEPS_OWN_NAMES.some((prefix) => rel.startsWith(prefix))) continue;

  const stem = isTest ? name.slice(0, -'.test'.length) : name;
  const wanted = isComponent ? /^[A-Z][A-Za-z0-9]*$/ : /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!ENTRY_POINTS.has(stem) && !wanted.test(stem)) {
    problems.push(
      `${rel} should be ${isComponent ? 'PascalCase' : 'kebab-case'} (see docs/contributing/conventions.md)`,
    );
  }
}

// Required documentation.

for (const doc of ['docs/architecture.md', 'docs/contributing/conventions.md', 'CONTRIBUTING.md']) {
  if (!exists(join(ROOT, doc)))
    problems.push(`${doc} is missing — it is how people find their way`);
}

// Report.

for (const warning of warnings) console.warn(`warn  ${warning}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`error ${problem}`);
  console.error(`\n${problems.length} structure problem(s). See docs/contributing/conventions.md.`);
  process.exit(1);
}

console.log(
  `structure ok — ${allDirs.length} packages, ${sourceFiles.length} source files` +
    (warnings.length > 0 ? `, ${warnings.length} warning(s)` : ''),
);
