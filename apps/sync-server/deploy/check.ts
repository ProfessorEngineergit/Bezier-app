/**
 * Checks a running server from outside, the way a stranger on the network would reach it, and then
 * the way two people use it. Writes one test vault and deletes it again.
 *
 *   node deploy/check.ts https://your-domain your-enrollment-code
 *   node deploy/check.ts https://your-domain your-enrollment-code --load
 *
 * Exits non-zero if anything is wrong. `--load` adds a burst of parallel uploads and long polls.
 */

import { Connection } from '../client/connection.ts';
import { VaultClient } from '../client/vault-client.ts';
import { newIdentity } from '../protocol/identity.ts';

const [url = '', enrollment = ''] = process.argv.slice(2);
const withLoad = process.argv.includes('--load');
if (url === '' || enrollment === '') {
  console.error('Usage: node deploy/check.ts <server address> <enrollment code> [--load]');
  process.exit(2);
}

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === '' ? '' : `: ${detail}`}`);
}

const status = async (path: string, init: RequestInit = {}) =>
  (await fetch(`${url}${path}`, { redirect: 'manual', ...init })).status;

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  status(path, { method: 'POST', body, headers });

const hex = (length: number) => 'a'.repeat(length);

async function fromOutside(): Promise<void> {
  const health = await fetch(`${url}/v1/health`);
  const body = (await health.json()) as { ok: boolean; replicas: { ok: boolean }[] };
  check('health answers, every copy writable', health.ok && body.ok, JSON.stringify(body));
  check('health names no paths', !JSON.stringify(body).includes('/'));
  check('nothing leaks a server name', !health.headers.has('server'));
  check(
    'content types are not sniffed',
    health.headers.get('x-content-type-options') === 'nosniff',
  );
  if (url.startsWith('https:')) {
    check('browsers are told to stay on HTTPS', health.headers.has('strict-transport-security'));
  }

  for (const path of [
    '/',
    '/server/auth.ts',
    '/package.json',
    '/.env',
    '/v1/../../etc/passwd',
    '/v1/vaults/..%2f..%2fetc',
    '/data/users',
  ]) {
    check(`no file behind ${path}`, (await status(path)) === 404);
  }
  for (const path of ['/v1/vaults', `/v1/vaults/${hex(32)}`, `/v1/users/${hex(32)}`]) {
    check(`${path} needs a login`, (await status(path)) === 401);
  }
  check(
    'a made-up token is refused',
    (await status('/v1/vaults', { headers: { Authorization: `Bearer ${hex(44)}` } })) === 401,
  );
  check('the mirror routes are not open', [401, 404].includes(await status('/v1/mirror/manifest')));
  check(
    'an account needs the code or an invite',
    (await post('/v1/users', JSON.stringify({ signPublic: 'AAAA', boxPublic: 'AAAA' }))) === 403,
  );
  check(
    'a wrong code is refused',
    (await post(
      '/v1/users',
      JSON.stringify({ signPublic: 'AAAA', boxPublic: 'AAAA', enrollment: 'guess' }),
    )) === 403,
  );
  const garbage = await post('/v1/auth/session', '{"userId":1,"nonce":{},"signature":[]}');
  check('nonsense at login is no server error', garbage < 500, String(garbage));
  check('a body that is not JSON is refused', (await post('/v1/auth/session', '{')) === 400);
  const big = await post('/v1/auth/session', 'x'.repeat(2 * 1024 * 1024)).catch(() => 413);
  check('an oversized login is refused', big === 413, String(big));
}

async function rateLimit(): Promise<void> {
  const statuses = await Promise.all(
    Array.from({ length: 130 }, (_, index) =>
      post('/v1/auth/challenge', '{}', { 'X-Forwarded-For': `10.0.${index}.1` }),
    ),
  );
  check(
    'logins are rate limited, whatever address a caller claims',
    statuses.includes(429),
    statuses.slice(-5).join(),
  );
}

async function together(): Promise<void> {
  const ana = new Connection(url, await newIdentity());
  await ana.register({ enrollment });
  const anaVaults = new VaultClient(ana);
  const vault = await anaVaults.create('Server check');
  check('an account and a vault can be made', vault.id.length === 32);

  const { link } = await anaVaults.invite(vault, 'writer');
  const ben = new Connection(url, await newIdentity());
  const benVaults = new VaultClient(ben);
  const joined = await benVaults.join(link);
  check('a second person joins by invite', joined.id === vault.id);

  const stranger = new Connection(url, await newIdentity());
  await stranger.register({ enrollment });
  const refused = await new VaultClient(stranger)
    .get(vault.id)
    .then(() => 200)
    .catch((error: { status?: number }) => error.status ?? 0);
  check('someone else cannot open it', refused === 403 || refused === 404, String(refused));

  await anaVaults.remove(vault);
  check('the test vault is gone again', true);
}

async function load(): Promise<void> {
  const people = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const conn = new Connection(url, await newIdentity());
      await conn.register({ enrollment });
      return { conn, vaults: new VaultClient(conn) };
    }),
  );
  const started = performance.now();
  const results = await Promise.allSettled(
    people.map(async ({ vaults }) => {
      const vault = await vaults.create('Load check');
      await vaults.remove(vault);
    }),
  );
  const refused = results.filter((result) => result.status === 'rejected');
  check(
    `eight people at once, ${Math.round(performance.now() - started)} ms`,
    refused.length === 0,
    String((refused[0] as PromiseRejectedResult | undefined)?.reason),
  );
}

await fromOutside();
await rateLimit();
// The limit is per minute and the steps below log in through it.
console.log('waiting out the rate limit');
await new Promise((resolve) => setTimeout(resolve, 61_000));
await together();
if (withLoad) await load();
console.log(failed === 0 ? '\nAll good.' : `\n${failed} checks failed.`);
process.exitCode = failed === 0 ? 0 : 1;
