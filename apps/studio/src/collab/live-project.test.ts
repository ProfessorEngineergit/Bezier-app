/**
 * Shared projects end to end, the way two people meet them: one shares a project, the
 * other's library gets it, both open it, and each sees the other's edits arrive while it
 * is open. Real sessions on the real kernel, real stores, a real server, real encryption.
 * Also what is easy to get wrong: edits made without a connection go when it is back, a
 * reader follows along and cannot change anything.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CadDocument, type Operation, RebuildCache, sameDocument } from '@bezier/core';
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import {
  Connection,
  LiveChannel,
  MemoryCache,
  newIdentity,
  Repository,
  VaultClient,
  type VaultHandle,
  Workspace,
} from '@bezier/sync';
import { createSyncServer, Store } from '@bezier/sync/server';
import { rectangleSketch } from '@bezier/ui';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placeholderSolver } from '../placeholder-solver.js';
import { Session, type SessionView } from '../session.js';
import { createBranch, discardBranch, historyOf, mergeBranch } from './branches.js';
import { startLiveProject } from './live-project.js';
import {
  download,
  isSharedId,
  type LinkStore,
  localIdFor,
  type ProjectLink,
  projectCodec,
  shareLocal,
} from './shared-projects.js';

let dir = '';
let url = '';
let server: ReturnType<typeof createSyncServer>;
let kernel: GeometryKernel;

beforeAll(async () => {
  kernel = await createOcctKernel();
  dir = await mkdtemp(join(tmpdir(), 'bezier-studio-live-'));
  server = createSyncServer({
    store: new Store(dir),
    enrollmentCode: 'studio-live-enrollment',
    publicRateLimit: 10_000,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true });
});

class MemoryLinks implements LinkStore {
  readonly links = new Map<string, ProjectLink>();
  async get(id: string) {
    return this.links.get(id);
  }
  async set(link: ProjectLink) {
    this.links.set(link.localId, link);
  }
  async remove(id: string) {
    this.links.delete(id);
  }
  async all() {
    return [...this.links.values()];
  }
}

async function person() {
  const conn = new Connection(url, await newIdentity());
  await conn.register({ enrollment: 'studio-live-enrollment' });
  return { conn, vaults: new VaultClient(conn) };
}

/** One device: a library, its links, and what it needs to reach the vault. */
function device(conn: Connection, vault: VaultHandle) {
  const store = new DocumentStore(new MemoryBackend());
  return {
    store,
    links: new MemoryLinks(),
    ws: new Workspace(new Repository(conn, vault, new MemoryCache()), 'main'),
    channel: (project: string) =>
      LiveChannel.open<CadDocument, Operation>(conn, vault, project, projectCodec),
    views: [] as SessionView[],
    open(id: string) {
      return Session.open(id, {
        kernel,
        solver: placeholderSolver(),
        store,
        cache: new RebuildCache(),
      });
    },
  };
}

type Device = ReturnType<typeof device>;

async function goLive(d: Device, session: Session, project: string, canWrite = true) {
  const link = await d.links.get(session.id);
  if (link === undefined) throw new Error('not linked');
  return startLiveProject({
    session,
    channel: await d.channel(project),
    link,
    links: d.links,
    canWrite,
    show: async (change) => void d.views.push(await change(session)),
  });
}

function box(n: number, x: number, index: number): Operation[] {
  return [
    {
      op: 'addFeature',
      id: `sketch-${n}`,
      type: 'sketch',
      name: 'Sketch',
      index,
      params: { plane: 'XY', sketch: rectangleSketch(`r${n}`, { x, y: 0, width: 20, height: 20 }) },
    },
    {
      op: 'addFeature',
      id: `extrude-${n}`,
      type: 'extrude',
      name: 'Extrude',
      index: index + 1,
      params: { sketch: `sketch-${n}`, distance: 10, direction: 'forward', operation: 'new' },
    },
  ];
}

async function until(what: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (what()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`waited for: ${label}`);
}

describe('a shared project, live', () => {
  it("shows each person the other's edits while both have it open", async () => {
    const alice = await person();
    const bob = await person();
    const vault = await alice.vaults.create('Werkstatt');
    await alice.vaults.share(vault, bob.conn.identity.userId, 'writer');
    const bobVault = (await bob.vaults.list()).find((v) => v.id === vault.id);
    if (bobVault === undefined) throw new Error('bob is not in the vault');
    const a = device(alice.conn, vault);
    const b = device(bob.conn, bobVault);

    // Alice shares a project from her library; it becomes the shared one.
    await a.store.create('doc-1', 'Bracket');
    const first = await Session.open('doc-1', {
      kernel,
      solver: placeholderSolver(),
      store: a.store,
    });
    await first.apply(box(1, 0, 0));
    const { project, localId } = await shareLocal(
      a.ws,
      a.channel,
      a.store,
      a.links,
      vault.id,
      'doc-1',
    );
    expect(localId).toBe(localIdFor(vault.id, project));
    expect(isSharedId(localId)).toBe(true);
    expect(await a.store.list()).toEqual([localId]);

    // Bob's library gets it.
    const got = await download(await b.channel(project), b.ws, b.store, b.links, {
      vault: vault.id,
      project,
      readOnly: false,
    });
    expect(got).toEqual({ localId, added: true });

    const sa = await a.open(localId);
    const sb = await b.open(localId);
    const la = await goLive(a, sa, project);
    const lb = await goLive(b, sb, project);

    // Alice adds a box: Bob's open model has it, built.
    await sa.apply(box(2, 40, 2));
    await until(() => sb.document.features.length === 4, 'bob sees the second box');
    const shown = b.views.at(-1);
    expect(shown?.statuses.get('extrude-2')).toEqual({ state: 'ok' });

    // Both change the first box at once; both end with the same model.
    const resize = (d: number): Operation => ({
      op: 'updateParams',
      id: 'extrude-1',
      params: { sketch: 'sketch-1', distance: d, direction: 'forward', operation: 'new' },
    });
    await Promise.all([sa.apply(resize(25)), sb.apply(resize(30))]);
    await until(
      () => la.sync.snapshot.pending.length === 0 && lb.sync.snapshot.pending.length === 0,
      'both sent',
    );
    await until(() => sameDocument(sa.document, sb.document), 'both agree');
    await la.stop();
    await lb.stop();
  }, 60_000);

  it('sends what was done without a connection once it is back, and a reader only follows', async () => {
    const alice = await person();
    const reader = await person();
    const vault = await alice.vaults.create('Kiosk');
    await alice.vaults.share(vault, reader.conn.identity.userId, 'reader');
    const readerVault = (await reader.vaults.list()).find((v) => v.id === vault.id);
    if (readerVault === undefined) throw new Error('reader is not in the vault');
    const a = device(alice.conn, vault);
    const r = device(reader.conn, readerVault);

    await a.store.create('doc-2', 'Plate');
    const { project, localId } = await shareLocal(
      a.ws,
      a.channel,
      a.store,
      a.links,
      vault.id,
      'doc-2',
    );
    await download(await r.channel(project), r.ws, r.store, r.links, {
      vault: vault.id,
      project,
      readOnly: true,
    });

    // Alice works with the project closed to the network (nothing live running).
    const offline = await a.open(localId);
    await offline.apply(box(1, 0, 0));

    // The reader opens it and follows; their session refuses edits.
    const sr = await r.open(localId);
    sr.readOnly = 'Look only.';
    const lr = await goLive(r, sr, project, false);
    await expect(sr.apply(box(9, 0, 0))).rejects.toThrow('Look only.');

    // Back online: what Alice did arrives.
    const sa = await a.open(localId);
    const la = await goLive(a, sa, project);
    await until(() => sr.document.features.length === 2, 'the reader sees the box');
    expect(r.views.at(-1)?.statuses.get('extrude-1')).toEqual({ state: 'ok' });
    await la.stop();
    await lr.stop();
  }, 60_000);
});

describe('branches of a live project', () => {
  it('branches from before a change, and merges the branch back into the open project', async () => {
    const alice = await person();
    const vault = await alice.vaults.create('Ideen');
    const a = device(alice.conn, vault);
    const b = device(alice.conn, vault);

    await a.store.create('doc-3', 'Housing');
    const { project, localId } = await shareLocal(
      a.ws,
      a.channel,
      a.store,
      a.links,
      vault.id,
      'doc-3',
    );
    const sa = await a.open(localId);
    const la = await goLive(a, sa, project);
    await sa.apply(box(1, 0, 0));
    await sa.apply({ op: 'renameFeature', id: 'extrude-1', name: 'Body' });
    // Sent, and back from the server, before it is looked at in the history.
    await until(() => la.sync.snapshot.seq >= 2 && la.sync.snapshot.pending.length === 0, 'sent');

    // Someone does not like the rename: a branch from before it.
    const history = await historyOf(await a.channel(project));
    expect(history.map((c) => c.description)).toEqual([
      expect.stringContaining('Add'),
      expect.stringContaining('Rename'),
    ]);
    const before = history[1]?.before;
    if (before === undefined) throw new Error('no history');
    const branchLocal = await createBranch(b.ws, b.channel, b.store, b.links, {
      vault: vault.id,
      parent: project,
      name: 'Taller',
      from: before,
    });
    const branchLink = await b.links.get(branchLocal);
    if (branchLink === undefined) throw new Error('branch not linked');
    expect(await b.store.list()).toContain(branchLocal);

    // On the branch, the box gets taller; the project is untouched.
    const sb = await b.open(branchLocal);
    expect(sb.document.meta.name).toBe('Housing (Taller)');
    expect(sb.document.features.find((f) => f.id === 'extrude-1')?.name).toBe('Extrude');
    const lb = await goLive(b, sb, branchLink.project);
    await sb.apply({
      op: 'updateParams',
      id: 'extrude-1',
      params: { sketch: 'sketch-1', distance: 40, direction: 'forward', operation: 'new' },
    });
    await until(
      () => lb.sync.snapshot.seq >= 1 && lb.sync.snapshot.pending.length === 0,
      'branch edit sent',
    );
    expect(sa.document.features.find((f) => f.id === 'extrude-1')?.params.distance).toBe(10);

    // Merged back: the open project gets the height and keeps its rename and its name.
    const merged = await mergeBranch(b.ws, b.channel, branchLink.project);
    expect(merged).toEqual({ conflicts: 0, changed: true });
    await until(
      () => sa.document.features.find((f) => f.id === 'extrude-1')?.params.distance === 40,
      'the project has the branch',
    );
    expect(sa.document.features.find((f) => f.id === 'extrude-1')?.name).toBe('Body');
    expect(sa.document.meta.name).toBe('Housing');
    // Merging again changes nothing.
    expect((await mergeBranch(b.ws, b.channel, branchLink.project)).changed).toBe(false);

    await discardBranch(b.ws, branchLink.project);
    expect((await b.ws.state()).tree[branchLink.project]).toBeUndefined();
    await la.stop();
    await lb.stop();
  }, 60_000);
});
