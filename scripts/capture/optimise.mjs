/**
 * Converts screenshots to WebP at the size committed to the repository.
 *
 *   node scripts/capture/optimise.mjs <input directory> <output directory> [--width 2400] [--quality 80]
 *
 * Defaults: 2400 px wide (sharp on a 1200 px column at 2x), quality 80, giving 34–161 KB versus
 * about 2 MB for the tour's PNGs. Needs `cwebp`. Fails if any output exceeds MAX_KB.
 */

import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const [input, output, ...flags] = process.argv.slice(2);
if (input === undefined || output === undefined) {
  console.error(
    'usage: optimise.mjs <input directory> <output directory> [--width N] [--quality N]',
  );
  process.exit(2);
}
const option = (name, fallback) => {
  const at = flags.indexOf(`--${name}`);
  return at === -1 ? fallback : flags[at + 1];
};
const WIDTH = option('width', '2400');
const QUALITY = option('quality', '80');
/** Per-image size limit for the repository. */
const MAX_KB = 400;

try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('cwebp is not installed (brew install webp, or apt install webp).');
  process.exit(2);
}

/** Reads a PNG's width from its header. Images are only downscaled, never upscaled. */
function widthOf(path) {
  const header = Buffer.alloc(24);
  const handle = openSync(path, 'r');
  readSync(handle, header, 0, 24, 0);
  closeSync(handle);
  return header.readUInt32BE(16);
}

mkdirSync(output, { recursive: true });
let total = 0;
let tooBig = 0;
for (const file of readdirSync(input)
  .filter((name) => name.endsWith('.png'))
  .sort()) {
  const target = join(output, `${basename(file, '.png')}.webp`);
  const source = join(input, file);
  const resize = widthOf(source) > Number(WIDTH) ? ['-resize', WIDTH, '0'] : [];
  execFileSync(
    'cwebp',
    ['-quiet', ...resize, '-q', QUALITY, '-m', '6', '-sharp_yuv', source, '-o', target],
    { stdio: ['ignore', 'inherit', 'ignore'] },
  );
  const kb = Math.round(statSync(target).size / 1024);
  total += kb;
  if (kb > MAX_KB) tooBig += 1;
  console.log(
    `${String(kb).padStart(5)} KB  ${basename(target)}${kb > MAX_KB ? '   TOO BIG' : ''}`,
  );
}
console.log(`${String(total).padStart(5)} KB  in all`);
process.exit(tooBig === 0 ? 0 : 1);
