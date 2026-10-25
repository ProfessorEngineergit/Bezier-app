/**
 * Collects the per-picture arrow files written by `e2e/tour/help` into
 * `apps/studio/src/help/arrows-generated.ts`.
 *
 *   node scripts/help-arrows.mjs help-out
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [input = 'help-out'] = process.argv.slice(2);
const directory = join(input, 'arrows');
const round = (value) => Math.round(value * 1000) / 1000;
const entries = readdirSync(directory)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => {
    const arrows = JSON.parse(readFileSync(join(directory, name), 'utf8')).map((a) => ({
      x1: round(a.x1),
      y1: round(a.y1),
      x2: round(a.x2),
      y2: round(a.y2),
    }));
    return `  '${name.replace(/\.json$/, '')}': ${JSON.stringify(arrows)},`;
  });

writeFileSync(
  'apps/studio/src/help/arrows-generated.ts',
  `/** Written by \`pnpm help:pictures\` (e2e/tour/help). Not edited by hand. */

import type { Arrow } from '@bezier/lessons';

export const ARROWS: Readonly<Record<string, readonly Arrow[]>> = {
${entries.join('\n')}
};
`,
);
console.log(`${entries.length} pictures' arrows written.`);
