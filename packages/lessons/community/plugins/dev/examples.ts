/** The example plugins as packages, for the development server and tests. */

import { readFileSync } from 'node:fs';
import type { PluginManifest } from '../format/manifest.js';
import { writePluginPackage } from '../format/package.js';

export const EXAMPLES = ['model-stats', 'json-export'] as const;

export function exampleSource(name: string): { manifest: PluginManifest; code: string } {
  const dir = `packages/lessons/community/plugins/dev/examples/${name}`;
  return {
    manifest: JSON.parse(readFileSync(`${dir}/plugin.json`, 'utf8')) as PluginManifest,
    code: readFileSync(`${dir}/main.js`, 'utf8'),
  };
}

export function examplePackage(
  name: string,
  change: (manifest: PluginManifest) => PluginManifest = (m) => m,
  code?: string,
): Promise<Uint8Array> {
  const source = exampleSource(name);
  return writePluginPackage({
    manifest: change(source.manifest),
    code: code ?? source.code,
    readme: '',
  });
}
