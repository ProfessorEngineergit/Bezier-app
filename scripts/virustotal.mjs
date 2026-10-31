/**
 * Sends the Windows installers of a release to VirusTotal and writes down what the scanners say.
 *
 *   VT_API_KEY=… node scripts/virustotal.mjs <dir> [--release v0.2.1]
 *
 * Takes the .exe and .msi in <dir>. With --release (and GH_TOKEN, GITHUB_REPOSITORY) the result is
 * added to the notes of that GitHub release, below a marker line, replacing an earlier run's.
 * It never fails a release because of a detection: unsigned installers draw a few, and the point is
 * that the people downloading can see which. Without VT_API_KEY it says so and does nothing.
 *
 * The files become public to VirusTotal's customers, as they already are on the release page.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://www.virustotal.com/api/v3';
const MARKER = '<!-- virustotal -->';
const POLL_MS = 30_000;
const GIVE_UP_MS = 25 * 60_000;

const args = process.argv.slice(2);
const dir = args[0];
const release = args.includes('--release') ? args[args.indexOf('--release') + 1] : null;
const key = process.env.VT_API_KEY ?? '';
if (dir === undefined) {
  console.error('usage: node scripts/virustotal.mjs <dir> [--release v0.2.1]');
  process.exit(1);
}
if (key === '') {
  console.log('::warning::No VT_API_KEY; the installers were not sent to VirusTotal.');
  process.exit(0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headers = { 'x-apikey': key, accept: 'application/json' };

async function call(path, init = {}) {
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`VirusTotal answered ${response.status} for ${path}.`);
  return response.json();
}

async function scan(file) {
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const name = file.split('/').pop();
  let known = await call(`/files/${sha256}`);
  if (known === null) {
    // Files above 32 MB go to a one-time address.
    const target = (await call('/files/upload_url')).data;
    const form = new FormData();
    form.append('file', new Blob([bytes]), name);
    const sent = await call(target, { method: 'POST', body: form });
    const id = sent.data.id;
    const began = Date.now();
    for (;;) {
      await sleep(POLL_MS);
      const analysis = await call(`/analyses/${id}`);
      if (analysis?.data.attributes.status === 'completed') break;
      if (Date.now() - began > GIVE_UP_MS)
        throw new Error(`${name}: VirusTotal did not finish in time.`);
    }
    known = await call(`/files/${sha256}`);
  }
  const attributes = known.data.attributes;
  const stats = attributes.last_analysis_stats;
  const flagged = Object.entries(attributes.last_analysis_results ?? {})
    .filter(([, r]) => r.category === 'malicious' || r.category === 'suspicious')
    .map(([engine, r]) => `${engine}: ${r.result ?? r.category}`);
  return { name, sha256, stats, flagged };
}

const files = readdirSync(dir)
  .filter((name) => /\.(exe|msi)$/i.test(name))
  .sort();
const lines = [MARKER, '', '**VirusTotal**', ''];
for (const name of files) {
  try {
    const { sha256, stats, flagged } = await scan(join(dir, name));
    const engines = stats.malicious + stats.suspicious + stats.undetected + stats.harmless;
    const link = `https://www.virustotal.com/gui/file/${sha256}`;
    lines.push(
      `- [${name}](${link}): ${stats.malicious + stats.suspicious} of ${engines} scanners flag it`,
    );
    for (const line of flagged) lines.push(`  - ${line}`);
  } catch (error) {
    lines.push(`- ${name}: not scanned (${error.message})`);
  }
}
const block = lines.join('\n');
console.log(block);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${block}\n`);

if (release !== null && files.length > 0) {
  const body = execFileSync('gh', [
    'release',
    'view',
    release,
    '--json',
    'body',
    '--jq',
    '.body',
  ]).toString();
  const kept = body.split(MARKER)[0].trimEnd();
  execFileSync('gh', ['release', 'edit', release, '--notes', `${kept}\n\n${block}\n`]);
}
