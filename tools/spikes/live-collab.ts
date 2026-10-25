/**
 * Spike: live collaboration where a server only orders edits and each device rebuilds locally
 * (ADR 0015).
 *
 * Checks that (1) the same operations in the same order produce the same document, face names
 * and mesh on separate kernels, and (2) a device whose optimistic local edit is reordered
 * converges via `LiveState` + `Session.adopt`. Uses two OCCT instances, three devices and an
 * array as the server, with scripted conflicting edits followed by a random run.
 *
 * Result (Node 22, occt-wasm 5): all checks pass; see ADR 0015.
 *
 * Run: bench/node_modules/.bin/tsx tools/spikes/live-collab.ts
 */

import { placeholderSolver } from '../../apps/studio/src/placeholder-solver.ts';
import { Session, type SessionView } from '../../apps/studio/src/session.ts';
import {
  type LiveEdit,
  LiveState,
  type Sequenced,
} from '../../apps/sync-server/client/live-state.ts';
import {
  apply,
  type CadDocument,
  edgeRef,
  faceRef,
  formatRef,
  type Operation,
  RebuildCache,
  sameDocument,
} from '../../packages/core/src/index.ts';
import type { GeometryKernel } from '../../packages/kernel/src/kernel.ts';
import { createOcctKernel } from '../../packages/kernel/src/occt-kernel.ts';
import { resetOcctForTesting } from '../../packages/kernel/src/wasm.ts';
import { DocumentStore, MemoryBackend } from '../../packages/storage/src/index.ts';
import { rectangleSketch } from '../../packages/ui/src/sketch-builder.ts';

const model = {
  apply: (doc: CadDocument, op: Operation) => {
    const next = apply(doc, op);
    return next.ok ? next.document : null;
  },
};

const server: Sequenced<Operation>[] = [];

class Device {
  readonly outbox: LiveEdit<Operation>[] = [];
  view: SessionView | null = null;
  #captured: Operation[] = [];
  adopted = 0;

  constructor(
    readonly name: string,
    readonly session: Session,
    readonly live: LiveState<CadDocument, Operation>,
  ) {
    session.onEdit((edit) => this.#captured.push(edit.operation));
  }

  /** Applies a local edit immediately and queues it for the server. */
  async edit(run: (s: Session) => Promise<SessionView | null>): Promise<void> {
    this.#captured = [];
    this.view = (await run(this.session)) ?? this.view;
    if (this.#captured.length > 0) this.outbox.push(this.live.local(this.#captured));
    this.#captured = [];
  }

  send(): void {
    for (const edit of this.outbox.splice(0)) {
      if (!server.some((e) => e.id === edit.id)) server.push({ ...edit, seq: server.length + 1 });
    }
  }

  async pull(): Promise<void> {
    if (this.live.receive(server.slice(this.live.seq))) {
      const view = await this.session.adopt(this.live.target);
      if (view !== null) {
        this.view = view;
        this.adopted += 1;
      }
    }
    check(
      sameDocument(this.session.document, this.live.target),
      `${this.name} shows what it should`,
    );
  }
}

let failures = 0;
function check(ok: boolean, what: string): void {
  if (!ok) {
    failures += 1;
    console.log(`  FAIL ${what}`);
  }
}

async function device(name: string, kernel: GeometryKernel): Promise<Device> {
  const store = new DocumentStore(new MemoryBackend());
  const session = await Session.create('live', 'Bracket', {
    kernel,
    solver: placeholderSolver(),
    store,
    cache: new RebuildCache(),
  });
  return new Device(name, session, new LiveState(model, session.document, 0));
}

function box(n: number, x: number, width: number, height: number, index: number): Operation[] {
  return [
    {
      op: 'addFeature',
      id: `sketch-${n}`,
      type: 'sketch',
      name: 'Sketch',
      index,
      params: { plane: 'XY', sketch: rectangleSketch(`r${n}`, { x, y: 0, width, height: 20 }) },
    },
    {
      op: 'addFeature',
      id: `extrude-${n}`,
      type: 'extrude',
      name: 'Extrude',
      index: index + 1,
      params: { sketch: `sketch-${n}`, distance: height, direction: 'forward', operation: 'new' },
    },
  ];
}

function distance(n: number, d: number): Operation {
  return {
    op: 'updateParams',
    id: `extrude-${n}`,
    params: { sketch: `sketch-${n}`, distance: d, direction: 'forward', operation: 'new' },
  };
}

/** Summarizes what the user sees: feature states, face names, triangle count and positions. */
async function picture(d: Device): Promise<string> {
  const view = await d.session.rebuild();
  const display = view.display;
  const statuses = [...view.statuses].map(([id, s]) => `${id}=${s.state}`).sort();
  if (display === null) return `empty ${statuses.join(',')}`;
  const names = display.faceRefs.map((ref) => (ref === null ? '-' : formatRef(ref)));
  let sum = 0;
  for (const value of display.mesh.positions) sum += value;
  return [
    statuses.join(','),
    names.join(','),
    `${display.mesh.indices.length / 3} triangles`,
    `positions ${sum.toFixed(6)}`,
  ].join(' | ');
}

async function settle(devices: readonly Device[], label: string): Promise<void> {
  for (const d of devices) d.send();
  for (const d of devices) await d.pull();
  const docs = devices.map((d) => d.session.document);
  check(
    docs.every((doc) => sameDocument(doc, docs[0] as CadDocument)),
    `${label}: one document everywhere`,
  );
  const pictures = await Promise.all(devices.map(picture));
  check(
    pictures.every((p) => p === pictures[0]),
    `${label}: same faces, names and mesh everywhere`,
  );
  console.log(`${label}: ${pictures[0]?.slice(0, 140)}…`);
}

const kernelA = await createOcctKernel();
resetOcctForTesting();
const kernelB = await createOcctKernel();
const a = await device('A', kernelA);
const b = await device('B', kernelB);
const c = await device('C', kernelA);
const all = [a, b, c];

// 1. One user models, the others follow.
await a.edit((s) => s.apply(box(1, 0, 40, 10, 0)));
await settle(all, '1 a box, followed');

// 2. Both change the same extrusion at once. The server gets B's first, so A's wins.
await a.edit((s) => s.apply(distance(1, 25)));
await b.edit((s) => s.apply(distance(1, 30)));
b.send();
a.send();
await settle(all, '2 same feature at once');
check(
  (a.session.document.features.find((f) => f.id === 'extrude-1')?.params.distance as number) === 25,
  '2 the later edit wins',
);

// 3. One rounds an edge while the other resizes the box under it.
const picked = edgeRef(faceRef('extrude-1', 'end'), faceRef('extrude-1', 'side-0'));
await a.edit((s) =>
  s.apply({
    op: 'addFeature',
    id: 'fillet-1',
    type: 'fillet',
    name: 'Fillet',
    index: 2,
    params: { edges: [formatRef(picked)], radius: 2 },
  }),
);
await b.edit((s) => s.apply(distance(1, 18)));
b.send();
a.send();
await settle(all, '3 fillet across a resize');

// 4. Two users append a body concurrently, each at the end of their own copy.
await b.edit((s) => s.apply(box(2, 60, 20, 12, s.document.features.length)));
await c.edit((s) => s.apply(box(3, -50, 20, 8, s.document.features.length)));
c.send();
b.send();
await settle(all, '4 two bodies added at once');

// 5. A undoes the fillet after B and C added their bodies.
await a.edit((s) => s.undo());
await settle(all, '5 undo after others edited');
check(!a.session.document.features.some((f) => f.id === 'fillet-1'), '5 the fillet is gone');

// 6. B removes a body while C is changing it; C's change does not apply and is skipped.
await b.edit((s) => s.apply({ op: 'removeFeature', id: 'extrude-3' }));
await c.edit((s) => s.apply(distance(3, 40)));
b.send();
c.send();
await settle(all, '6 change to a removed feature');

// 7. Random concurrent edits from three devices, settled periodically.
let seed = 7;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
let next = 10;
for (let round = 0; round < 40; round++) {
  const who = all[Math.floor(rand() * all.length)] as Device;
  const doc = who.session.document;
  const extrudes = doc.features.filter((f) => f.type === 'extrude').map((f) => f.id);
  const choice = rand();
  const target = extrudes[Math.floor(rand() * extrudes.length)];
  if (choice < 0.3 || target === undefined) {
    const n = next++;
    await who.edit((s) =>
      s.apply(box(n, n * 30, 10 + rand() * 20, 5 + rand() * 20, doc.features.length)),
    );
  } else if (choice < 0.6) {
    const n = Number(target.split('-')[1]);
    await who.edit((s) => s.apply(distance(n, Math.round(5 + rand() * 30))));
  } else if (choice < 0.7) {
    await who.edit((s) => s.apply({ op: 'removeFeature', id: target }));
  } else if (choice < 0.8) {
    await who.edit((s) => s.apply({ op: 'renameFeature', id: target, name: `Part ${round}` }));
  } else if (choice < 0.9) {
    await who.edit((s) => s.undo());
  } else {
    await who.edit((s) =>
      s.apply({ op: 'moveFeature', id: target, toIndex: Math.floor(rand() * doc.features.length) }),
    );
  }
  if (rand() < 0.5) who.send();
  if (rand() < 0.3) await who.pull();
  if (round % 8 === 7) await settle(all, `7 random, round ${round + 1}`);
}
await settle(all, '7 random, end');

console.log(
  `${server.length} edits on the server; adopted ${all.map((d) => `${d.name} ${d.adopted}`).join(', ')}`,
);
console.log(failures === 0 ? 'ALL HELD' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
