/**
 * Builds the desktop app for release.
 *
 *   pnpm release                  # this machine's platform
 *   pnpm release --version 0.2.0  # set the version first, everywhere it lives
 *   pnpm release --skip-checks    # when `pnpm check` and `pnpm e2e` just ran
 *   pnpm release --all            # all three platforms, on GitHub's machines
 *   pnpm release --all --channel alpha   # the same, opening the alpha line (VITE_CHANNEL)
 *
 * Tauri only builds for the host platform. `--all` runs `.github/workflows/release.yml` on macOS,
 * Windows and Linux runners, which produces artifacts but no GitHub release.
 *
 * On a Mac with both Apple targets installed the app is built universal; otherwise for the host
 * architecture only. Output goes to `release/<version>/` with SHA-256 sums. Signing and
 * notarisation run only when their credentials are in the environment: on a Mac the APPLE_* ones,
 * on Windows a certificate already in the store, named by WINDOWS_CERTIFICATE_THUMBPRINT (the
 * release workflow imports it from its secrets), or a signing tool in WINDOWS_SIGN_COMMAND. See
 * docs/contributing/windows-signing.md.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: on Windows the latter is "/D:/a/…", which join() turns into "D:\D:\a\…".
const root = fileURLToPath(new URL('..', import.meta.url));
const desktop = join(root, 'apps/desktop');
const tauriConf = join(desktop, 'src-tauri/tauri.conf.json');
const cargoToml = join(desktop, 'src-tauri/Cargo.toml');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? null : (args[at + 1] ?? null);
};

function run(command, commandArgs, cwd = root) {
  console.log(`\n$ ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\n${command} failed. Nothing was released.`);
    process.exit(result.status ?? 1);
  }
}

function has(command) {
  const probe = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

/** Sets the version in tauri.conf.json, Cargo.toml, package.json and the app's version.ts. */
function setVersion(version) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error(`"${version}" is not a version like 1.2.3.`);
    process.exit(1);
  }
  const conf = JSON.parse(readFileSync(tauriConf, 'utf8'));
  conf.version = version;
  writeFileSync(tauriConf, `${JSON.stringify(conf, null, 2)}\n`);
  const cargo = readFileSync(cargoToml, 'utf8').replace(
    /^version = ".*"$/m,
    `version = "${version}"`,
  );
  writeFileSync(cargoToml, cargo);
  const pkgPath = join(desktop, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  // The version shown in Settings and in reports.
  const said = join(root, 'apps/studio/src/version.ts');
  writeFileSync(
    said,
    readFileSync(said, 'utf8').replace(/VERSION = '.*'/, `VERSION = '${version}'`),
  );
  console.log(`Version set to ${version}.`);
}

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() && !name.endsWith('.app') ? files(path) : [path];
  });
}

const requested = option('version');
if (requested !== null) setVersion(requested);
const version = JSON.parse(readFileSync(tauriConf, 'utf8')).version;

if (flag('all')) {
  if (!has('gh')) {
    console.error(
      'Building all three platforms runs on GitHub; install the GitHub CLI (gh) first.',
    );
    process.exit(1);
  }
  // Without `--ref` the workflow builds the default branch. Start it on this branch's upstream, and
  // only if the upstream is at the local HEAD with a clean tree. The workflow verifies the commit
  // and records it in BUILD-INFO.txt.
  const git = (...gitArgs) =>
    execFileSync('git', gitArgs, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  let upstream = '';
  try {
    upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
  } catch {
    console.error('This branch tracks no remote branch; push it first (git push -u <remote>).');
    process.exit(1);
  }
  const remote = upstream.slice(0, upstream.indexOf('/'));
  const branch = upstream.slice(remote.length + 1);
  const head = git('rev-parse', 'HEAD');
  const pushed = git('ls-remote', remote, `refs/heads/${branch}`).split(/\s/)[0] ?? '';
  if (git('status', '--porcelain') !== '' || pushed !== head) {
    console.error(
      `The workflow would not build what is here: ${remote}/${branch} is at ${pushed.slice(0, 8) || 'nothing'}, ` +
        `this checkout at ${head.slice(0, 8)}${git('status', '--porcelain') === '' ? '' : ' with uncommitted changes'}. ` +
        'Commit and push first.',
    );
    process.exit(1);
  }
  const repo = git('remote', 'get-url', remote)
    .replace(/^.*github\.com[:/]/, '')
    .replace(/\.git$/, '');
  const channel = option('channel') ?? 'stable';
  run('gh', [
    'workflow',
    'run',
    'release.yml',
    '--repo',
    repo,
    '--ref',
    branch,
    '-f',
    `version=${version}`,
    '-f',
    `channel=${channel}`,
    '-f',
    `commit=${head}`,
  ]);
  console.log(
    `\nStarted the Release workflow in ${repo} on ${branch} at ${head.slice(0, 8)} (${channel}).\n` +
      'Follow it with `gh run watch`, and download the results with `gh run download`.',
  );
  process.exit(0);
}

for (const tool of ['pnpm', 'cargo']) {
  if (!has(tool)) {
    console.error(`${tool} is needed to build the desktop app and was not found.`);
    process.exit(1);
  }
}

if (!flag('skip-checks')) {
  run('pnpm', ['check']);
  run('pnpm', ['e2e'], root);
}

const bundleArgs = ['--filter', '@bezier/desktop', 'exec', 'tauri', 'build'];
let targetDir = join(desktop, 'src-tauri/target/release/bundle');
if (process.platform === 'darwin') {
  const installed = execFileSync('rustup', ['target', 'list', '--installed']).toString();
  if (installed.includes('x86_64-apple-darwin') && installed.includes('aarch64-apple-darwin')) {
    bundleArgs.push('--target', 'universal-apple-darwin');
    targetDir = join(desktop, 'src-tauri/target/universal-apple-darwin/release/bundle');
  } else {
    console.log(
      "Only this Mac's own architecture is installed, so the app runs on this kind of Mac only.\n" +
        'For one app for Intel and Apple silicon: rustup target add x86_64-apple-darwin aarch64-apple-darwin',
    );
  }
} else if (process.platform === 'win32') {
  bundleArgs.push('--bundles', 'msi,nsis');
  const thumbprint = process.env.WINDOWS_CERTIFICATE_THUMBPRINT;
  const signCommand = process.env.WINDOWS_SIGN_COMMAND;
  if (thumbprint || signCommand) {
    // Tauri then signs the app, the MSI and the installer: with the certificate in the store, and
    // timestamped so the signature outlives it, or with the tool, which gets each file as %1. A file,
    // not a JSON argument: the shell would eat the quotes.
    const conf = join(desktop, 'src-tauri/target/signing.conf.json');
    mkdirSync(join(desktop, 'src-tauri/target'), { recursive: true });
    const windows = signCommand
      ? { signCommand }
      : {
          certificateThumbprint: thumbprint,
          digestAlgorithm: 'sha256',
          timestampUrl: process.env.WINDOWS_TIMESTAMP_URL || 'http://timestamp.digicert.com',
        };
    writeFileSync(conf, JSON.stringify({ bundle: { windows } }));
    bundleArgs.push('--config', 'src-tauri/target/signing.conf.json');
  }
} else {
  bundleArgs.push('--bundles', 'deb,rpm,appimage');
}
run('pnpm', bundleArgs);

const out = join(root, 'release', version);
mkdirSync(out, { recursive: true });
const wanted = /\.(dmg|msi|exe|deb|rpm|AppImage)$/;
const built = files(targetDir).filter((path) => wanted.test(path));
if (built.length === 0) {
  console.error(`The build finished but left no installer under ${targetDir}.`);
  process.exit(1);
}
const sums = [];
for (const path of built) {
  const target = join(out, basename(path));
  copyFileSync(path, target);
  const hash = createHash('sha256').update(readFileSync(target)).digest('hex');
  sums.push(`${hash}  ${basename(path)}`);
}
writeFileSync(join(out, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);

// Release notes: commit subjects since the last tag (or the last 30 commits), plus downloads and
// checksums.
function changes() {
  const range = (() => {
    try {
      const tag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
      return [`${tag}..HEAD`];
    } catch {
      return ['-30'];
    }
  })();
  return execFileSync('git', ['log', ...range, '--no-merges', '--pretty=- %s'], { cwd: root })
    .toString()
    .trim();
}
// What this runner could not sign. Linux has no signing step.
const signed = {
  darwin: Boolean(process.env.APPLE_CERTIFICATE),
  win32: Boolean(process.env.WINDOWS_CERTIFICATE_THUMBPRINT || process.env.WINDOWS_SIGN_COMMAND),
}[process.platform];
const unsigned =
  signed === false
    ? `\n> Not signed yet: the first start asks for confirmation on ${process.platform === 'win32' ? 'Windows' : 'macOS'}.\n`
    : '';
writeFileSync(
  join(out, 'RELEASE_NOTES.md'),
  `# Bezier ${version}\n${unsigned}\n## Changes\n\n${changes()}\n\n## Downloads\n\n${sums.map((line) => `- \`${line.split('  ')[1]}\` SHA-256 \`${line.split('  ')[0]}\``).join('\n')}\n`,
);
console.log(`\nBezier ${version}, in ${out}:`);
for (const line of sums) console.log(`  ${line.split('  ')[1]}`);
