/**
 * Prints project statistics as Markdown.
 *
 *   node scripts/project-facts.mjs
 *
 * Lines are physical lines of .ts, .tsx and .rs files under `src/`, including comments and blanks.
 * `*.test.*` files are counted separately.
 */

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function* files(directory) {
  for (const name of readdirSync(directory)) {
    if (name === 'node_modules' || name === 'target' || name === 'dist') continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const lines = (path) => readFileSync(path, 'utf8').split('\n').length;
const isSource = (path) => /\.(ts|tsx|rs)$/.test(path);
const isTest = (path) => /\.test\.(ts|tsx)$/.test(path);

const groups = [];
for (const parent of ['packages', 'apps', 'crates']) {
  for (const name of readdirSync(join(ROOT, parent))) {
    // The desktop app keeps its Rust under src-tauri.
    const src = [
      join(ROOT, parent, name, 'src'),
      join(ROOT, parent, name, 'src-tauri', 'src'),
    ].find((candidate) => {
      try {
        return statSync(candidate).isDirectory();
      } catch {
        return false;
      }
    });
    if (src === undefined) continue;
    let sourceFiles = 0;
    let sourceLines = 0;
    let testFiles = 0;
    let testLines = 0;
    for (const path of files(src)) {
      if (!isSource(path)) continue;
      if (isTest(path)) {
        testFiles += 1;
        testLines += lines(path);
      } else {
        sourceFiles += 1;
        sourceLines += lines(path);
      }
    }
    groups.push({ name: `${parent}/${name}`, sourceFiles, sourceLines, testFiles, testLines });
  }
}

const total = (key) => groups.reduce((sum, group) => sum + group[key], 0);
// Let Playwright count tests; a regex would miss some declaration forms.
const listing = execSync('pnpm exec playwright test --list --project=chromium', {
  cwd: ROOT,
}).toString();
const e2e = /Total: (\d+) tests? in (\d+) files?/.exec(listing);
const featureKinds = (
  readFileSync(join(ROOT, 'packages/core/src/features/index.ts'), 'utf8').match(
    /^import '\.\/[a-z-]+\.js';$/gm,
  ) ?? []
).length;

console.log('| Package | Source files | Source lines | Test files | Test lines |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const group of groups) {
  console.log(
    `| \`${group.name}\` | ${group.sourceFiles} | ${group.sourceLines.toLocaleString('en')} | ${group.testFiles} | ${group.testLines.toLocaleString('en')} |`,
  );
}
console.log(
  `| **All** | **${total('sourceFiles')}** | **${total('sourceLines').toLocaleString('en')}** | **${total('testFiles')}** | **${total('testLines').toLocaleString('en')}** |`,
);
console.log('');
console.log(
  `- Architecture decision records: ${readdirSync(join(ROOT, 'docs/adr')).filter((name) => /^\d{4}-.*\.md$/.test(name)).length}`,
);
console.log(
  `- End-to-end: ${e2e?.[1] ?? '?'} tests in ${e2e?.[2] ?? '?'} files (each runs in Chromium and WebKit)`,
);
console.log(`- Feature modules in the registry (\`packages/core/src/features\`): ${featureKinds}`);
