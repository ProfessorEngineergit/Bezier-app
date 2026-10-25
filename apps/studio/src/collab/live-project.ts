/**
 * A shared project while open: local edits are sent as made, and others' edits are applied as
 * they arrive (ADR 0015). Not a React hook, so it runs in Node against the real kernel and server
 * (`live-project.test.ts`); `use-collab-project.ts` starts and stops it. Remote edits go through
 * the app's `run`, so they wait while a local edit is building and are never half-applied.
 */

import { type CadDocument, type Operation, sameDocument } from '@bezier/core';
import type { ArrivedEdit, LiveChannel, LiveSnapshot, LiveStatus } from '@bezier/sync';
import { LiveSync } from '@bezier/sync';
import type { Session, SessionView } from '../session.js';
import { type LinkStore, liveModel, type ProjectLink, resume } from './shared-projects.js';

export interface LiveProjectOptions {
  session: Session;
  channel: LiveChannel<CadDocument, Operation>;
  link: ProjectLink;
  links: LinkStore;
  canWrite: boolean;
  /** Applies a change the way the app applies every change (`use-run.ts`). */
  show(change: (session: Session) => Promise<SessionView>): Promise<void>;
  onStatus?(status: LiveStatus): void;
  /** Others' edits, once applied: who changed something, for presence. */
  onEdits?(edits: readonly ArrivedEdit<Operation>[]): void;
}

export interface LiveProject {
  readonly sync: LiveSync<CadDocument, Operation>;
  /** Stops listening and keeps unsent edits for next time. */
  stop(): Promise<void>;
}

/** Minimum interval between link saves; the local journal holds the edits meanwhile. */
const SAVE_EVERY_MS = 2000;

export async function startLiveProject(options: LiveProjectOptions): Promise<LiveProject> {
  const { session, channel, link, links, canWrite, show } = options;
  let from: LiveSnapshot<CadDocument, Operation>;
  let unsent: Operation[] = [];
  const resumed = resume(link, session.document);
  if (resumed !== null) {
    from = resumed.from;
    unsent = canWrite ? resumed.unsent : [];
  } else {
    const loaded = await LiveSync.load(channel, liveModel);
    if (loaded === null) throw new Error('This project is not shared live yet.');
    from = { seq: loaded.seq, confirmed: loaded.document, pending: [] };
  }

  let latest: ProjectLink = link;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: LiveSnapshot<CadDocument, Operation> = from;
  const save = async () => {
    saveTimer = null;
    latest = { ...latest, live: snapshot };
    await links.set(latest).catch(() => undefined);
  };

  const sync = new LiveSync<CadDocument, Operation>({
    channel,
    model: liveModel,
    from,
    canWrite,
    onChange: async (target, edits) => {
      await show(async (s) =>
        s.id === session.id ? await adoptOrRebuild(s, target) : s.rebuild(),
      );
      options.onEdits?.(edits);
    },
    onSaved: (next) => {
      snapshot = next;
      saveTimer ??= setTimeout(() => void save(), SAVE_EVERY_MS);
    },
    ...(options.onStatus === undefined ? {} : { onStatus: options.onStatus }),
  });

  if (unsent.length > 0) sync.edit(unsent);
  // Remote edits received last time but not applied before the project closed.
  if (!sameDocument(session.document, sync.target)) {
    const target = sync.target;
    await show((s) => adoptOrRebuild(s, target));
  }

  // One action is one change, for the others and in the history.
  const off = session.onCommit((ops) => sync.edit(ops));

  sync.start();
  return {
    sync,
    async stop() {
      off();
      await sync.stop();
      if (saveTimer !== null) clearTimeout(saveTimer);
      snapshot = sync.snapshot;
      await save();
    },
  };
}

async function adoptOrRebuild(session: Session, target: CadDocument): Promise<SessionView> {
  return (await session.adopt(target)) ?? session.rebuild();
}
