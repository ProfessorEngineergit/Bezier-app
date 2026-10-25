/**
 * Writes website/dist/releases.json from the GitHub releases and mirrors the release files.
 *
 *   RELEASES_TOKEN=… node website/deploy/releases.mjs            mirror the files into dist/downloads
 *   RELEASES_TOKEN=… node website/deploy/releases.mjs --link     link to GitHub instead
 *
 * Channels map to repositories (docs/repositories.md): stable is the newest release of
 * `bezier-app` (tag v1.2.3), beta the newest pre-release of `bezier` (tag v1.3.0-beta.1).
 *
 * Files are mirrored by default because private repositories cannot serve public downloads, and to
 * avoid GitHub rate limits. A channel without a release is written as null.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const token = process.env.RELEASES_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const link = process.argv.includes('--link');

const CHANNELS = {
  stable: {
    repository: process.env.STABLE_REPOSITORY ?? 'ProfessorEngineergit/bezier-app',
    prerelease: false,
  },
  beta: {
    repository: process.env.BETA_REPOSITORY ?? 'ProfessorEngineergit/bezier',
    prerelease: true,
  },
};

/** Classifies a release file by its Tauri file name; returns null for other files. */
export function classify(name) {
  const lower = name.toLowerCase();
  const arch = /aarch64|arm64/.test(lower)
    ? 'Apple silicon'
    : /universal/.test(lower)
      ? 'Apple silicon and Intel'
      : /x64|x86_64|amd64/.test(lower)
        ? 'x64'
        : '';
  if (lower.endsWith('.dmg')) return { platform: 'macos', kind: 'dmg', arch };
  if (lower.endsWith('.msi')) return { platform: 'windows', kind: 'msi', arch };
  if (lower.endsWith('.exe')) return { platform: 'windows', kind: 'exe', arch };
  if (lower.endsWith('.appimage')) return { platform: 'linux', kind: 'appimage', arch };
  if (lower.endsWith('.deb')) return { platform: 'linux', kind: 'deb', arch };
  if (lower.endsWith('.rpm')) return { platform: 'linux', kind: 'rpm', arch };
  return null;
}

const headers = (accept = 'application/vnd.github+json') => ({
  Accept: accept,
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function newest(repository, prerelease) {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=30`, {
    headers: headers(),
  });
  if (!response.ok) throw new Error(`${repository}: GitHub answered ${response.status}.`);
  const releases = await response.json();
  return releases.find((release) => !release.draft && release.prerelease === prerelease) ?? null;
}

async function channel(name, { repository, prerelease }) {
  const release = await newest(repository, prerelease);
  if (release === null) return null;
  const version = release.tag_name.replace(/^v/, '');
  const files = [];
  for (const asset of release.assets) {
    const kind = classify(asset.name);
    if (kind === null) continue;
    let url = asset.browser_download_url;
    let sha256 = null;
    if (!link) {
      // The asset API URL with this Accept header returns the file, also for private repositories.
      const response = await fetch(asset.url, { headers: headers('application/octet-stream') });
      if (!response.ok) throw new Error(`${asset.name}: GitHub answered ${response.status}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const dir = join(dist, 'downloads', name, version);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, asset.name), bytes);
      sha256 = createHash('sha256').update(bytes).digest('hex');
      url = `/downloads/${name}/${version}/${encodeURIComponent(asset.name)}`;
    }
    files.push({ name: asset.name, url, size: asset.size, sha256, ...kind });
  }
  return {
    version,
    tag: release.tag_name,
    date: release.published_at,
    notes: release.html_url,
    files,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = { generatedAt: new Date().toISOString() };
  for (const [name, config] of Object.entries(CHANNELS)) {
    out[name] = await channel(name, config);
    console.log(
      `${name}: ${out[name] ? `${out[name].version}, ${out[name].files.length} files` : 'none'}`,
    );
  }
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'releases.json'), `${JSON.stringify(out, null, 2)}\n`);
}
