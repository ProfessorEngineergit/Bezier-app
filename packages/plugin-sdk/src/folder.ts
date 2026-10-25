/**
 * Reads, reviews and packs a plugin folder, using the same review as the store
 * (`community/plugins/server/review.ts`), so authors see the result before uploading.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  manifestProblem,
  type PluginManifest,
} from '../../lessons/community/plugins/format/manifest.js';
import { writePluginPackage } from '../../lessons/community/plugins/format/package.js';
import { Refused, reviewUpload } from '../../lessons/community/plugins/server/review.js';

export interface Checked {
  manifest: PluginManifest | null;
  /** Blocking issues: the plugin cannot be published until they are fixed. */
  refused: string[];
  /** Issues a reviewer will check manually. */
  findings: string[];
  bytes: Uint8Array | null;
}

export async function checkFolder(dir: string): Promise<Checked> {
  const manifestFile = join(dir, 'plugin.json');
  const codeFile = join(dir, 'main.js');
  if (!existsSync(manifestFile) || !existsSync(codeFile)) {
    return {
      manifest: null,
      refused: ['A plugin folder holds plugin.json and main.js.'],
      findings: [],
      bytes: null,
    };
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch {
    return {
      manifest: null,
      refused: ['plugin.json is not valid JSON.'],
      findings: [],
      bytes: null,
    };
  }
  const problem = manifestProblem(manifest);
  if (problem !== null) return { manifest: null, refused: [problem], findings: [], bytes: null };
  const valid = manifest as PluginManifest;
  const readmeFile = join(dir, 'README.md');
  const packed = await writePluginPackage({
    manifest: valid,
    code: readFileSync(codeFile, 'utf8'),
    readme: existsSync(readmeFile) ? readFileSync(readmeFile, 'utf8') : '',
  });
  try {
    const reviewed = await reviewUpload(packed, []);
    return { manifest: valid, refused: [], findings: reviewed.findings, bytes: reviewed.bytes };
  } catch (error) {
    if (error instanceof Refused)
      return { manifest: valid, refused: [error.message], findings: [], bytes: null };
    throw error;
  }
}
