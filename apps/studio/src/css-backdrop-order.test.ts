/**
 * The production build minifies CSS with Lightning CSS. Given `backdrop-filter` and then
 * `-webkit-backdrop-filter` with the same value, it keeps only the prefixed one, which Chromium
 * (WebView2, Chrome, Edge) does not know: every panel lost its blur there and kept it in WebKit.
 * Written the other way round, prefixed first, both survive.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FOLDERS = ['apps/studio/src', 'packages/ui/src', 'packages/lessons', 'website/assets'];

function stylesheets(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) stylesheets(path, out);
    else if (entry.name.endsWith('.css')) out.push(path);
  }
  return out;
}

describe('backdrop-filter in the stylesheets', () => {
  it('is written with the prefixed line first, so the minifier keeps both', () => {
    const plainFirst = /^[ \t]*backdrop-filter:([^;]+);\s*-webkit-backdrop-filter:\1;/m;
    const broken = FOLDERS.flatMap((folder) => stylesheets(join(ROOT, folder)))
      .filter((file) => plainFirst.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));
    expect(broken).toEqual([]);
  });
});
