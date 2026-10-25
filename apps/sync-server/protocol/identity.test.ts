import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromB64, utf8 } from './bytes.ts';
import { randomBytes } from './crypto.ts';
import {
  backupIdentity,
  exportIdentity,
  importIdentity,
  inviteMaterial,
  newIdentity,
  openInvite,
  restoreIdentity,
  sealInvite,
  sign,
  unwrap,
  verify,
  wrapFor,
} from './identity.ts';

test('a wrapped key opens only for its recipient', async () => {
  const alice = await newIdentity();
  const mallory = await newIdentity();
  const secret = randomBytes(32);
  const wrapped = fromB64(await wrapFor(secret, alice.boxPublic, alice.userId));
  assert.deepEqual(await unwrap(alice, wrapped), secret);
  await assert.rejects(unwrap(mallory, wrapped));
});

test('a key wrapped for one id does not open under another, even with the same keys', async () => {
  const alice = await newIdentity();
  const wrapped = fromB64(await wrapFor(randomBytes(32), alice.boxPublic, 'f'.repeat(32)));
  await assert.rejects(unwrap(alice, wrapped));
});

test('signatures verify for the signer only', async () => {
  const alice = await newIdentity();
  const bob = await newIdentity();
  const sig = await sign(alice, utf8('commit'));
  assert.equal(await verify(alice.signPublic, utf8('commit'), sig), true);
  assert.equal(await verify(bob.signPublic, utf8('commit'), sig), false);
  assert.equal(await verify(alice.signPublic, utf8('commit!'), sig), false);
});

test('an identity survives export and import, and can be exported again', async () => {
  const alice = await newIdentity();
  const again = await importIdentity(await exportIdentity(alice));
  assert.equal(again.userId, alice.userId);
  const secret = randomBytes(32);
  assert.deepEqual(
    await unwrap(again, fromB64(await wrapFor(secret, alice.boxPublic, alice.userId))),
    secret,
  );
  assert.equal((await importIdentity(await exportIdentity(again))).userId, alice.userId);
});

test('a backup opens with its passphrase only', async () => {
  const alice = await newIdentity();
  const file = await backupIdentity(alice, 'correct horse battery');
  assert.ok(!file.includes(await exportIdentity(alice)));
  assert.equal((await restoreIdentity(file, 'correct horse battery')).userId, alice.userId);
  await assert.rejects(restoreIdentity(file, 'wrong horse battery'), /passphrase is not right/);
  await assert.rejects(backupIdentity(alice, 'short'), /at least 10/);
});

test('an invite opens with its secret, and the server-side hash does not open it', async () => {
  const secret = randomBytes(32);
  const keyring = randomBytes(64);
  const payload = fromB64(await sealInvite(secret, keyring));
  assert.deepEqual(await openInvite(secret, payload), keyring);
  await assert.rejects(openInvite(randomBytes(32), payload));
  const { token, tokenHash } = await inviteMaterial(secret);
  assert.notEqual(token, tokenHash);
  assert.equal(tokenHash.length, 64);
});
