/**
 * `.bezierplugin` packages: a stored (uncompressed) zip of `plugin.json`, `main.js` and optionally
 * `README.md`. Packages are untrusted, so sizes are checked before anything is expanded.
 */

import { strFromU8, strToU8, unzip, zip } from 'fflate';
import { manifestProblem, PLUGIN_LIMITS, type PluginManifest } from './manifest.js';

export interface PluginPackage {
  manifest: PluginManifest;
  code: string;
  readme: string;
}

const ENTRIES: Record<string, number> = {
  'plugin.json': 20_000,
  'main.js': PLUGIN_LIMITS.codeBytes,
  'README.md': 20_000,
};

export function writePluginPackage(plugin: PluginPackage): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {
    'plugin.json': strToU8(JSON.stringify(plugin.manifest, null, 2)),
    'main.js': strToU8(plugin.code),
  };
  if (plugin.readme !== '') entries['README.md'] = strToU8(plugin.readme);
  return new Promise((resolve, reject) => {
    zip(entries, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

/** Reads a package. Throws a user-facing error when it cannot be run. */
export async function readPluginPackage(bytes: Uint8Array): Promise<PluginPackage> {
  if (bytes.byteLength > PLUGIN_LIMITS.packageBytes) {
    throw new Error(
      `Plugin packages must be smaller than ${PLUGIN_LIMITS.packageBytes / 1000} KB.`,
    );
  }
  let compressed = false;
  let files: Record<string, Uint8Array>;
  try {
    files = await new Promise((resolve, reject) => {
      unzip(
        bytes,
        {
          filter: (entry) => {
            const limit = ENTRIES[entry.name];
            if (limit === undefined) return false;
            // Only stored entries, whose declared size is their real size (no zip bombs).
            if (entry.compression !== 0) compressed = true;
            return entry.compression === 0 && entry.originalSize <= limit;
          },
        },
        (error, data) => (error ? reject(error) : resolve(data)),
      );
    });
  } catch {
    throw new Error('This file is not a .bezierplugin package.');
  }
  if (compressed) throw new Error('Package the plugin again without compression.');
  const rawManifest = files['plugin.json'];
  const rawCode = files['main.js'];
  if (rawManifest === undefined || rawCode === undefined) {
    throw new Error('This package has no plugin in it.');
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(rawManifest));
  } catch {
    throw new Error('The plugin’s manifest is not valid JSON.');
  }
  const problem = manifestProblem(manifest);
  if (problem !== null) throw new Error(problem);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let code: string;
  let readme = '';
  try {
    code = decoder.decode(rawCode);
    const rawReadme = files['README.md'];
    if (rawReadme !== undefined) readme = decoder.decode(rawReadme);
  } catch {
    throw new Error('The plugin’s files must be UTF-8 text.');
  }
  return { manifest: manifest as PluginManifest, code, readme };
}
