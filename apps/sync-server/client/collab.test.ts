/**
 * Presence, read-only links and mirroring, against real servers on real files.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fromUtf8, utf8 } from '../protocol/bytes.ts';
import { newIdentity } from '../protocol/identity.ts';
import { walkFiles } from '../server/disk.ts';
import { createSyncServer } from '../server/http.ts';
import { pullMirror } from '../server/mirror.ts';
import { Store } from '../server/store.ts';
import { Connection } from './connection.ts';
import { MemoryCache } from './memory-cache.ts';
import { describePresence, newDeviceId, othersOn, PresenceClient } from './presence.ts';
import { Repository } from './repository.ts';
import { VaultClient } from './vault-client.ts';
import { createViewLink, listViewLinks, openViewLink, withdrawViewLink } from './view-links.ts';
import { Workspace } from './workspace.ts';

const ENROLLMENT = 'collab-test-enrollment-code';
const MIRROR_TOKEN = 'a-mirror-token-that-is-long-enough-123';

let dir = '';
let url = '';
let mirrorUrl = '';
let server: ReturnType<typeof createSyncServer>;
let mirrorServer: ReturnType<typeof createSyncServer>;
let mirrorStore: Store;

async function listen(s: ReturnType<typeof createSyncServer>): Promise<string> {
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bezier-sync-collab-'));
  server = createSyncServer({
    store: new Store(join(dir, 'first')),
    enrollmentCode: ENROLLMENT,
    mirrorToken: MIRROR_TOKEN,
    publicRateLimit: 10_000,
  });
  url = await listen(server);
  mirrorStore = new Store(join(dir, 'mirror'));
  mirrorServer = createSyncServer({ store: mirrorStore, publicRateLimit: 10_000 });
  mirrorUrl = await listen(mirrorServer);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => mirrorServer.close(resolve));
  await rm(dir, { recursive: true });
});

async function person(base = url) {
  const conn = new Connection(base, await newIdentity());
  await conn.register({ enrollment: ENROLLMENT });
  return { conn, vaults: new VaultClient(conn) };
}

test('presence says who has which project open, on which machine, and forgets them', async () => {
  const alice = await person();
  const bob = await person();
  const vault = await alice.vaults.create('presence');
  await alice.vaults.share(vault, bob.conn.identity.userId, 'writer');
  const [bobsVault] = await bob.vaults.list();
  assert.ok(bobsVault !== undefined);

  const aliceHere = new PresenceClient(alice.conn, vault, newDeviceId());
  const bobHere = new PresenceClient(bob.conn, bobsVault, newDeviceId());
  await bobHere.beat({
    name: 'Bob',
    machine: 'Bob’s MacBook',
    project: 'p1',
    branch: 'main',
    mode: 'editing',
  });
  await aliceHere.beat({
    name: 'Alice',
    machine: 'Workshop PC',
    project: 'p1',
    branch: 'main',
    mode: 'viewing',
  });

  const seen = await aliceHere.list();
  const others = othersOn(seen, 'p1');
  assert.equal(others.length, 1);
  assert.equal(describePresence(others), 'Bob is editing this on Bob’s MacBook.');
  assert.equal(othersOn(seen, 'p2').length, 0);
  assert.equal(seen.find((p) => p.self)?.machine, 'Workshop PC');

  // Someone else cannot take over Bob's device id.
  const raw = await bobHere.list();
  const bobsDevice = raw.find((p) => p.self)?.device ?? '';
  const stolen = new PresenceClient(alice.conn, vault, bobsDevice);
  await assert.rejects(
    stolen.beat({ name: 'X', machine: 'X', project: 'p1', branch: 'main', mode: 'editing' }),
    /in use/,
  );

  await bobHere.leave();
  assert.equal(othersOn(await aliceHere.list(), 'p1').length, 0);

  // Removing Bob also clears his presence.
  await bobHere.beat({
    name: 'Bob',
    machine: 'Bob’s MacBook',
    project: 'p1',
    branch: 'main',
    mode: 'editing',
  });
  await alice.vaults.removeMember(vault, bob.conn.identity.userId, false);
  assert.equal(othersOn(await aliceHere.list(), 'p1').length, 0);
});

test('a read-only link opens a vault without an account and can change nothing', async () => {
  const alice = await person();
  const vault = await alice.vaults.create('view links');
  const ws = new Workspace(new Repository(alice.conn, vault, new MemoryCache()), 'main');
  const { id: project } = await ws.addProject(
    'Bracket',
    utf8('{"meta":{"name":"Bracket"},"features":[]}'),
  );

  const { link, id } = await createViewLink(alice.conn, vault, {
    label: 'For the client',
    branch: 'main',
    project,
  });
  assert.match(link, /#view=[0-9a-f]{32}\.[\w-]{43}&branch=main&project=p-[0-9a-f]{16}$/);
  assert.deepEqual(
    (await listViewLinks(alice.conn, vault)).map((v) => v.label),
    ['For the client'],
  );

  const opened = await openViewLink(link);
  assert.equal(opened.project, project);
  const repo = new Repository(opened.conn, opened.vault, new MemoryCache());
  const main = await repo.branch('main');
  assert.equal(main?.verified, true);
  const head = await repo.readCommit(main?.head ?? '');
  const doc = await repo.getDocument(head.tree[project]?.document ?? '');
  assert.match(fromUtf8(doc), /Bracket/);

  // Writing through the link is refused by the server, not just hidden by the app.
  const c = await repo.commit([main?.head ?? ''], {}, 'vandalism');
  await assert.rejects(repo.push('main', c, main), /log in|Please/);
  await assert.rejects(opened.conn.call('GET', `/v1/vaults/${vault.id}`), /log in|Please/);

  // The link is for this vault only.
  const other = await alice.vaults.create('another');
  await assert.rejects(opened.conn.refs(other.id), /No such vault/);

  // Withdrawn, it stops working.
  await withdrawViewLink(alice.conn, vault, id);
  await assert.rejects(openViewLink(link), /does not work any more/);
});

test('a read-only link stops working when the key changes', async () => {
  const alice = await person();
  const bob = await person();
  const vault = await alice.vaults.create('rotation and links');
  await alice.vaults.share(vault, bob.conn.identity.userId, 'reader');
  const { link } = await createViewLink(alice.conn, vault, { label: 'x' });
  await alice.vaults.removeMember(vault, bob.conn.identity.userId);
  await assert.rejects(openViewLink(link), /does not work any more/);
});

test('a mirror copies everything as ciphertext and serves the same history', async () => {
  const alice = await person();
  const vault = await alice.vaults.create('mirrored');
  const ws = new Workspace(new Repository(alice.conn, vault, new MemoryCache()), 'main');
  await ws.addProject('Lid', utf8('the lid'));
  await ws.branchOff('idea');

  // A wrong token gets nothing.
  await assert.rejects(
    pullMirror(mirrorStore, url, 'not-the-token-not-the-token-not-it'),
    /not right/,
  );

  const first = await pullMirror(mirrorStore, url, MIRROR_TOKEN);
  assert.ok(first.objects >= 3);
  assert.equal(first.failed.length, 0);
  // Running again copies nothing new.
  const again = await pullMirror(mirrorStore, url, MIRROR_TOKEN);
  assert.equal(again.objects, 0);
  assert.equal(again.refs, 0);

  // Alice can log in on the mirror with the same identity and read the same history.
  const onMirror = new Connection(mirrorUrl, alice.conn.identity);
  const [mirrored] = (await new VaultClient(onMirror).list()).filter((v) => v.id === vault.id);
  assert.ok(mirrored !== undefined);
  const repo = new Repository(onMirror, mirrored, new MemoryCache());
  assert.deepEqual(
    (await repo.branches()).map((b) => b.name),
    ['idea', 'main'],
  );
  const state = await new Workspace(repo, 'main').state();
  const [entry] = Object.values(state.tree);
  assert.equal(fromUtf8(await repo.getDocument(entry?.document ?? '')), 'the lid');

  // A vault deleted on the first server is kept on the mirror.
  await alice.vaults.remove(vault);
  const after = await pullMirror(mirrorStore, url, MIRROR_TOKEN);
  assert.ok(after.kept.includes(vault.id));

  // Nothing on the mirror is readable.
  for (const rel of await walkFiles(join(dir, 'mirror'))) {
    const text = (await readFile(join(dir, 'mirror', rel))).toString('latin1');
    assert.ok(!text.includes('the lid') && !text.includes('mirrored'), rel);
  }
});

test('a server without a mirror token has no mirror routes', async () => {
  const res = await fetch(`${mirrorUrl}/v1/mirror/manifest`, {
    headers: { Authorization: `Mirror ${MIRROR_TOKEN}` },
  });
  assert.equal(res.status, 404);
});
