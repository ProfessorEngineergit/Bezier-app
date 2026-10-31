/**
 * Writes latest.json, the file the app's updater reads (tauri.conf.json, plugins.updater.endpoints).
 *
 *   node scripts/updater-manifest.mjs <release-dir> <version> [notes.md]
 *
 * For each system it needs the package the updater installs and the signature `tauri build` made for it
 * (the build ran with TAURI_SIGNING_PRIVATE_KEY, see scripts/release.mjs): the .app.tar.gz on macOS, the
 * setup .exe on Windows, the .AppImage on Linux. A system without both stops the run, so a release
 * that no installed app could update to is never published.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, version, notesFile] = process.argv.slice(2);
if (dir === undefined || version === undefined) {
  console.error('usage: node scripts/updater-manifest.mjs <release-dir> <version> [notes.md]');
  process.exit(1);
}
const repository = process.env.GITHUB_REPOSITORY ?? 'ProfessorEngineergit/Bezier-app';
const base = `https://github.com/${repository}/releases/download/v${version}`;
const names = readdirSync(dir);

/** The package with this ending and its signature, as the manifest wants them. */
function entry(ending) {
  const file = names.find((name) => name.endsWith(ending));
  if (file === undefined || !existsSync(join(dir, `${file}.sig`))) return null;
  return {
    signature: readFileSync(join(dir, `${file}.sig`), 'utf8').trim(),
    url: `${base}/${encodeURIComponent(file)}`,
  };
}

const mac = entry('.app.tar.gz');
const windows = entry('-setup.exe');
const linux = entry('.AppImage');
const missing = [
  ['macOS (.app.tar.gz and .sig)', mac],
  ['Windows (-setup.exe and .sig)', windows],
  ['Linux (.AppImage and .sig)', linux],
]
  .filter(([, found]) => found === null)
  .map(([name]) => name);
if (missing.length > 0) {
  console.error(
    `No updater package in ${dir} for: ${missing.join(', ')}. Not writing latest.json.`,
  );
  process.exit(1);
}

const manifest = {
  version,
  notes:
    notesFile !== undefined && existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : '',
  pub_date: new Date().toISOString(),
  platforms: {
    // One universal app serves both kinds of Mac.
    'darwin-aarch64': mac,
    'darwin-x86_64': mac,
    'windows-x86_64': windows,
    'linux-x86_64': linux,
  },
};
writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json for ${version}: ${Object.keys(manifest.platforms).join(', ')}`);
