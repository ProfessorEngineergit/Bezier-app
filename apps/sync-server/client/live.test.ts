/**
 * Live projects against a real server and real files: ordering, long polling, deduplication,
 * large edits as objects, and restarting from a checkpoint. The document is a plain map; the
 * CAD model is tested in the app (tools/spikes/live-collab.ts).
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { newIdentity } from '../protocol/identity.ts';
import { createSyncServer } from '../server/http.ts';
import { Store } from '../server/store.ts';
import { Connection, SyncError } from './connection.ts';
import { LiveChannel } from './live.ts';
import { type LiveModel, LiveState } from './live-state.ts';
import { LiveSync } from './live-sync.ts';
import { VaultClient } from './vault-client.ts';

const ENROLLMENT = 'live-test-enrollment-code';

type Doc = Readonly<Record<string, number>>;
type Op = { set: string; to: number } | { drop: string };

const model: LiveModel<Doc, Op> = {
  apply(doc, op) {
    if ('set' in op) return { ...doc, [op.set]: op.to };
    if (!(op.drop in doc)) return null;
    const { [op.drop]: _gone, ...rest } = doc;
    return rest;
  },
};
const codec = {
  encode: (doc: Doc) => new TextEncoder().encode(JSON.stringify(doc)),
  decode: (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as Doc,
};

let dir = '';
let url = '';
let server: ReturnType<typeof createSyncServer>;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bezier-sync-live-'));
  server = createSyncServer({
    store: new Store(join(dir, 'data')),
    enrollmentCode: ENROLLMENT,
    publicRateLimit: 10_000,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true });
});

async function person() {
  const conn = new Connection(url, await newIdentity());
  await conn.register({ enrollment: ENROLLMENT });
  return { conn, vaults: new VaultClient(conn) };
}

async function team() {
  const alice = await person();
  const bob = await person();
  const vault = await alice.vaults.create('live');
  await alice.vaults.share(vault, bob.conn.identity.userId, 'writer');
  const bobVault = (await bob.vaults.list()).find((v) => v.id === vault.id);
  assert.ok(bobVault);
  const a = await LiveChannel.open<Doc, Op>(alice.conn, vault, 'p-1', codec);
  const b = await LiveChannel.open<Doc, Op>(bob.conn, bobVault, 'p-1', codec);
  return { alice, bob, vault, bobVault, a, b };
}

test('a project is live once it has a checkpoint, and starts from it', async () => {
  const { a, b } = await team();
  assert.equal(await LiveSync.load(b, model), null);
  await a.create({ width: 10 });
  assert.deepEqual(await LiveSync.load(b, model), { seq: 0, document: { width: 10 } });
});

test('edits come back to everyone in one order, and the later of two wins', async () => {
  const { a, b } = await team();
  await a.create({});
  const sa = new LiveState(model, {}, 0);
  const sb = new LiveState(model, {}, 0);
  const ea = sa.local([{ set: 'width', to: 20 }]);
  const eb = sb.local([
    { set: 'width', to: 30 },
    { set: 'depth', to: 5 },
  ]);
  assert.equal(await b.send(eb), 1);
  assert.equal(await a.send(ea), 2);
  // Sent twice, recorded once.
  assert.equal(await a.send(ea), 2);
  const arrived = await a.poll(0, false);
  assert.equal(arrived.seq, 2);
  assert.ok(sa.receive(arrived.edits));
  assert.ok(sb.receive((await b.poll(0, false)).edits));
  assert.deepEqual(sa.target, { width: 20, depth: 5 });
  assert.deepEqual(sb.target, sa.target);
  assert.equal(sa.pending.length, 0);
});

test('a device waiting hears of an edit as soon as it is made', async () => {
  const { a, b } = await team();
  await a.create({});
  const waiting = b.poll(0, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const started = Date.now();
  await a.send(new LiveState(model, {}, 0).local([{ set: 'x', to: 1 }]));
  const arrived = await waiting;
  assert.equal(arrived.edits.length, 1);
  assert.ok(Date.now() - started < 1000);
});

test('a large edit travels as an object and arrives whole', async () => {
  const { a, b } = await team();
  await a.create({});
  const ops: Op[] = Array.from({ length: 6000 }, (_, i) => ({ set: `key-${i}`, to: i }));
  await a.send(new LiveState(model, {}, 0).local(ops));
  const arrived = await b.poll(0, false);
  assert.equal(arrived.edits[0]?.ops.length, 6000);
});

test('two people with LiveSync see each other, and a reader cannot send', async () => {
  const { alice, vault, a, b } = await team();
  await a.create({ width: 1 });
  const reader = await person();
  await alice.vaults.share(vault, reader.conn.identity.userId, 'reader');
  const readerVault = (await reader.vaults.list()).find((v) => v.id === vault.id);
  assert.ok(readerVault);
  const r = await LiveChannel.open<Doc, Op>(reader.conn, readerVault, 'p-1', codec);
  await assert.rejects(
    r.send(new LiveState(model, {}, 0).local([{ set: 'width', to: 9 }])),
    (error: unknown) => error instanceof SyncError && error.status === 403,
  );

  const seen: Doc[] = [];
  const start = async (channel: LiveChannel<Doc, Op>, into: Doc[]) => {
    const loaded = await LiveSync.load(channel, model);
    assert.ok(loaded);
    const sync = new LiveSync<Doc, Op>({
      channel,
      model,
      from: { seq: loaded.seq, confirmed: loaded.document, pending: [] },
      canWrite: true,
      onChange: (target) => void into.push(target),
    });
    sync.start();
    return sync;
  };
  const one = await start(a, []);
  const two = await start(b, seen);
  one.edit([{ set: 'width', to: 42 }]);
  for (let i = 0; i < 50 && seen.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(seen.at(-1), { width: 42 });
  assert.deepEqual(two.target, { width: 42 });
  await one.stop();
  await two.stop();
});

test('a device away past the kept edits starts again from the checkpoint', async () => {
  const { a, b } = await team();
  await a.create({});
  const writer = new LiveState(model, {}, 0);
  let doc: Doc = {};
  for (let i = 1; i <= 620; i++) {
    const edit = writer.local([{ set: 'n', to: i }]);
    await a.send(edit);
  }
  doc = { n: 620 };
  await a.checkpoint(620, doc);
  // Edit 1 is gone; a device that last saw it is handed the checkpoint.
  const behind = await b.poll(1, false);
  assert.equal(behind.checkpoint?.seq, 620);
  assert.deepEqual(behind.checkpoint?.document, doc);
  // One that is only a little behind still gets the edits themselves.
  const near = await b.poll(600, false);
  assert.equal(near.checkpoint, undefined);
  assert.equal(near.edits[0]?.seq, 601);
});
