#!/usr/bin/env node
/**
 * Issues invitation codes for the alpha channel.
 *
 *   pnpm invite keygen                  # once; refuses to replace a key that exists
 *   pnpm invite new "Ada" --days 30     # new code; --forever for no expiry
 *   pnpm invite list                    # issued codes and their state
 *   pnpm invite revoke <id>             # takes effect with the next app version
 *   pnpm invite check <code>            # decode and verify a code
 *
 * The private key lives in ~/.config/bezier (override with BEZIER_INVITE_HOME), outside the
 * repository. The public key is written to packages/lessons/community/client/invite-key.ts. The
 * code format must match packages/lessons/community/client/invite.ts byte for byte.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = join(root, 'packages/lessons/community/client');
const home = process.env.BEZIER_INVITE_HOME ?? join(homedir(), '.config', 'bezier');
const keyFile = join(home, 'invite-key.pem');
const logFile = join(home, 'invites.jsonl');
const DOMAIN = 'bezier-invite-v1';
const PREFIX = 'BZ-';

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const message = (payload) => Buffer.concat([Buffer.from(DOMAIN), payload]);

function publicKeyText(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') fail('Could not read the public key.');
  return jwk.x;
}

function privateKey() {
  if (!existsSync(keyFile)) fail(`No key at ${keyFile}. Make one with: pnpm invite keygen`);
  return createPrivateKey(readFileSync(keyFile));
}

function log() {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

function readRevoked() {
  const text = readFileSync(join(client, 'invite-revoked.ts'), 'utf8');
  return [...text.matchAll(/'([0-9a-f]{12})'/g)].map((match) => match[1]);
}

const day = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);

function describe(code) {
  const text = code.replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) return { error: 'does not start with BZ-' };
  const bytes = Buffer.from(text.slice(PREFIX.length), 'base64url');
  if (bytes.length !== 75) return { error: 'is not the length of a code' };
  const payload = bytes.subarray(0, 11);
  const seconds = payload.readUInt32BE(7);
  const publicKey = createPublicKey(privateKey());
  return {
    id: payload.subarray(1, 7).toString('hex'),
    expires: seconds === 0 ? null : seconds,
    genuine: verify(null, message(payload), publicKey, bytes.subarray(11)),
  };
}

if (command === 'keygen') {
  if (existsSync(keyFile) && !flag('force'))
    fail(
      `A key exists at ${keyFile}. A new one would make every code so far stop working; pass --force if that is meant.`,
    );
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const { publicKey, privateKey: secret } = generateKeyPairSync('ed25519');
  writeFileSync(keyFile, secret.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  writeFileSync(
    join(client, 'invite-key.ts'),
    `/**\n * The public half of the key that signs invitation codes (\`scripts/invite.mjs keygen\`). It only\n * checks; the private half stays with the project's owner. Replacing it ends every code made so far.\n */\nexport const INVITE_PUBLIC_KEY = '${publicKeyText(publicKey)}';\n`,
  );
  console.log(`Key written to ${keyFile}. Keep a copy somewhere safe, it cannot be made again.`);
  console.log('The public key is in packages/lessons/community/client/invite-key.ts: commit it.');
} else if (command === 'new') {
  const name = args[1];
  if (name === undefined || name.startsWith('--'))
    fail('Who is it for? pnpm invite new "Ada" --days 30');
  const days = flag('forever') ? 0 : Number(option('days') ?? 90);
  if (!Number.isFinite(days) || days < 0) fail('--days takes a number of days.');
  const expires = days === 0 ? 0 : Math.floor(Date.now() / 1000) + Math.round(days * 86400);
  const payload = Buffer.alloc(11);
  payload[0] = 1;
  randomBytes(6).copy(payload, 1);
  payload.writeUInt32BE(expires, 7);
  const signature = sign(null, message(payload), privateKey());
  const code = PREFIX + Buffer.concat([payload, signature]).toString('base64url');
  const id = payload.subarray(1, 7).toString('hex');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  appendFileSync(
    logFile,
    `${JSON.stringify({ id, for: name, made: new Date().toISOString(), expires: expires === 0 ? null : expires })}\n`,
  );
  console.log(code);
  console.error(
    `\nFor ${name}, ${expires === 0 ? 'does not run out' : `good until ${day(expires)}`} (id ${id}).`,
  );
} else if (command === 'list') {
  const revoked = readRevoked();
  const now = Date.now() / 1000;
  const entries = log();
  if (entries.length === 0) console.log('No invitations made yet.');
  for (const entry of entries) {
    const state = revoked.includes(entry.id)
      ? 'withdrawn'
      : entry.expires !== null && entry.expires <= now
        ? 'run out'
        : 'good';
    console.log(
      `${entry.id}  ${state.padEnd(9)} ${entry.expires === null ? 'no end   ' : `until ${day(entry.expires)}`}  ${entry.for}`,
    );
  }
} else if (command === 'revoke') {
  const id = args[1];
  if (!/^[0-9a-f]{12}$/.test(id ?? '')) fail('Give the 12-character id from "pnpm invite list".');
  const revoked = readRevoked();
  if (!revoked.includes(id)) revoked.push(id);
  writeFileSync(
    join(client, 'invite-revoked.ts'),
    `/**\n * Invitations that were withdrawn, by id. Written by \`pnpm invite revoke <id>\`: a withdrawal\n * reaches a device with the next version of the app, so an invitation that has to end sooner is\n * made to expire (\`pnpm invite new --days\`).\n */\nexport const REVOKED_INVITES: readonly string[] = [${revoked.map((entry) => `'${entry}'`).join(', ')}];\n`,
  );
  console.log(`${id} withdrawn. It stops working on devices with the next version of the app.`);
} else if (command === 'check') {
  const result = describe(args[1] ?? '');
  if (result.error) fail(`That ${result.error}.`);
  console.log(
    `${result.genuine ? 'genuine' : 'NOT genuine'}, id ${result.id}, ${result.expires === null ? 'does not run out' : `good until ${day(result.expires)}`}`,
  );
} else {
  console.log(
    'pnpm invite keygen | new "Name" [--days N | --forever] | list | revoke <id> | check <code>',
  );
}
