import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { toHex } from '../protocol/bytes.ts';
import { sha256 } from '../protocol/crypto.ts';
import { Store } from './store.ts';

const vault = 'ab'.repeat(16);

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'bezier-sync-'));
  const [a, b] = [join(dir, 'a'), join(dir, 'b')];
  return { dir, a, b, store: new Store(a, [b]) };
}

test('an object is written to every copy and refused if its id does not match', async () => {
  const { dir, a, b, store } = await setup();
  const data = new TextEncoder().encode('sealed bytes');
  const id = toHex(await sha256(data));
  assert.equal(await store.putObject(vault, id, data), 'stored');
  assert.equal(await store.putObject(vault, 'f'.repeat(64), data), 'mismatch');
  const rel = store.objectPath(vault, id);
  assert.deepEqual(new Uint8Array(await readFile(join(a, rel))), data);
  assert.deepEqual(new Uint8Array(await readFile(join(b, rel))), data);
  await rm(dir, { recursive: true });
});

test('a rotten primary copy is served from the replica and repaired', async () => {
  const { dir, a, store } = await setup();
  const data = new TextEncoder().encode('model');
  const id = toHex(await sha256(data));
  await store.putObject(vault, id, data);
  await writeFile(join(a, store.objectPath(vault, id)), 'bit rot');
  assert.deepEqual(await store.getObject(vault, id), data);
  assert.deepEqual(new Uint8Array(await readFile(join(a, store.objectPath(vault, id)))), data);
  await rm(dir, { recursive: true });
});

test('scrub restores a replica that missed writes and reports what has no good copy', async () => {
  const { dir, a, b, store } = await setup();
  const data = new TextEncoder().encode('part');
  const id = toHex(await sha256(data));
  await store.putObject(vault, id, data);
  await rm(join(b, store.objectPath(vault, id)));
  const lostId = 'c'.repeat(64);
  await new Store(a).write(store.objectPath(vault, lostId), new TextEncoder().encode('garbage'));

  const report = await store.scrub();
  assert.ok(report.repaired.some((p) => p.startsWith(b)));
  assert.deepEqual(report.lost, [store.objectPath(vault, lostId)]);
  assert.deepEqual(new Uint8Array(await readFile(join(b, store.objectPath(vault, id)))), data);
  await rm(dir, { recursive: true });
});
