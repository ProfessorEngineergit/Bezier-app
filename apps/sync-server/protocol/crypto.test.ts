import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromUtf8, utf8 } from './bytes.ts';
import {
  newKeyring,
  openObject,
  openValue,
  parseKeyring,
  refId,
  rotated,
  sealObject,
  sealValue,
  serializeKeyring,
} from './crypto.ts';

test('the same content seals to the same id, so unchanged chunks are stored once', async () => {
  const ring = await newKeyring();
  const a = await sealObject(ring, utf8('a bracket'));
  const b = await sealObject(ring, utf8('a bracket'));
  const c = await sealObject(ring, utf8('a bracket, wider'));
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.equal(fromUtf8(await openObject(ring, a.id, a.sealed)), 'a bracket');
});

test('another vault cannot open an object, nor recognise it by id', async () => {
  const one = await newKeyring();
  const two = await newKeyring();
  const sealed = await sealObject(one, utf8('secret part'));
  assert.notEqual((await sealObject(two, utf8('secret part'))).id, sealed.id);
  await assert.rejects(openObject(two, sealed.id, sealed.sealed));
});

test('an object swapped under another id is refused before decryption', async () => {
  const ring = await newKeyring();
  const a = await sealObject(ring, utf8('a'));
  const b = await sealObject(ring, utf8('b'));
  await assert.rejects(openObject(ring, a.id, b.sealed), /does not match/);
});

test('a value sealed for one purpose does not open as another', async () => {
  const ring = await newKeyring();
  const sealed = await sealValue(ring, { name: 'main' }, 'ref');
  assert.deepEqual(await openValue(ring, sealed, 'ref'), { name: 'main' });
  await assert.rejects(openValue(ring, sealed, 'meta'));
});

test('after a rotation old content still opens, new content needs the new key', async () => {
  const old = await newKeyring();
  const before = await sealObject(old, utf8('before'));
  const ring = await rotated(old);
  assert.equal(ring.current.epoch, 1);
  const after = await sealObject(ring, utf8('after'));
  assert.equal(fromUtf8(await openObject(ring, before.id, before.sealed)), 'before');
  await assert.rejects(openObject(old, after.id, after.sealed), /does not have/);
  // A branch keeps its id across the rotation.
  assert.equal(await refId(ring, 'main'), await refId(old, 'main'));
});

test('tampering with the epoch byte breaks the seal instead of choosing another key', async () => {
  const ring = await rotated(await rotated(await newKeyring()));
  const sealed = await sealValue(ring, 'x', 'meta');
  const forged = sealed.slice();
  forged[2] = 1;
  await assert.rejects(openValue(ring, forged, 'meta'));
});

test('a keyring survives serialization', async () => {
  const ring = await rotated(await newKeyring());
  const again = await parseKeyring(serializeKeyring(ring));
  const sealed = await sealObject(ring, utf8('part'));
  assert.equal(fromUtf8(await openObject(again, sealed.id, sealed.sealed)), 'part');
});

test('branch ids do not reveal branch names', async () => {
  const one = await newKeyring();
  const two = await newKeyring();
  assert.notEqual(await refId(one, 'main'), await refId(two, 'main'));
  assert.equal((await refId(one, 'main')).length, 32);
});
