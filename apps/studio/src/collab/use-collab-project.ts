/**
 * Collaboration for an open shared project: keeps it live (`live-project.ts`), enforces read-only
 * when shared for viewing, announces presence ("Alice is editing this on Workshop PC"), and
 * publishes peers and connection state for the title bar (`ProjectPeople.tsx`). Does nothing for
 * unshared projects or with collaboration off.
 */

import { diffOperations } from '@bezier/core';
import { HEARTBEAT_MS, othersOn, PresenceClient } from '@bezier/sync';
import { type MutableRefObject, useEffect, useRef } from 'react';
import type { Session, SessionDeps } from '../session.js';
import type { Run } from '../use-run.js';
import type { TasksHandle } from '../use-tasks.js';
import { type Collab, useCollab } from './CollabProvider.js';
import { links } from './collab-store.js';
import { type LiveProject, startLiveProject } from './live-project.js';
import { isSharedId } from './shared-projects.js';

export const READ_ONLY_MESSAGE =
  'This project is shared with you to look at. Changes cannot be made here.';

export function useCollabProject({
  sessionId,
  sessionRef,
  depsRef,
  tasks,
  run,
  open,
}: {
  sessionId: string | null;
  sessionRef: MutableRefObject<Session | null>;
  depsRef: MutableRefObject<SessionDeps | null>;
  tasks: Pick<TasksHandle, 'notify' | 'begin'>;
  run: Run;
  /** Opens a project from the library: a branch just started. */
  open: (localId: string) => void;
}): void {
  const collab = useCollab();
  // Read through refs: the context value and tasks handle change every render, and restarting the
  // effect would drop the live connection each time.
  const collabRef = useRef<Collab>(collab);
  collabRef.current = collab;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const runRef = useRef(run);
  runRef.current = run;
  const openRef = useRef(open);
  openRef.current = open;
  const connected = collab.connected || collab.links.length > 0;

  useEffect(() => {
    if (sessionId === null || !isSharedId(sessionId) || !collab.config.enabled || !connected)
      return;
    let live = true;
    let timer = 0;
    let project: LiveProject | null = null;
    let presence: PresenceClient | null = null;

    void (async () => {
      const link = await links.get(sessionId);
      const c = collabRef.current;
      const vault = link === undefined ? undefined : c.vault(link.vault);
      const session = sessionRef.current;
      if (!live || link === undefined || vault === undefined || session?.id !== sessionId) return;

      const readOnly = link.readOnly || vault.role === 'reader' || c.isLink(vault.id);
      if (readOnly) {
        session.readOnly = READ_ONLY_MESSAGE;
        tasksRef.current.notify({ title: 'View only', detail: READ_ONLY_MESSAGE });
      }
      let present: import('@bezier/sync').Present[] = [];
      let status: 'live' | 'offline' = 'live';
      const publish = () =>
        live &&
        collabRef.current.setOpenProject({
          localId: sessionId,
          vault: vault.id,
          project: link.project,
          readOnly,
          status,
          present,
          document: () => session.document,
          restore: (document) =>
            runRef.current((s) => s.apply(diffOperations(s.document, document))),
          library: () => depsRef.current?.store ?? null,
          open: (id) => openRef.current(id),
        });
      publish();

      try {
        project = await startLiveProject({
          session,
          channel: await c.liveChannel(vault, link.project),
          link,
          links,
          canWrite: !readOnly,
          show: (change) => runRef.current(change),
          onStatus: (next) => {
            status = next;
            publish();
          },
        });
      } catch (error) {
        tasksRef.current.notify({
          title: 'This shared project could not be reached',
          detail: `Your changes stay on this device. ${error instanceof Error ? error.message : ''}`,
          tone: 'fail',
        });
        return;
      }
      if (!live) {
        void project.stop();
        return;
      }

      // Via a read-only link there is no account to show presence for.
      if (c.isLink(vault.id)) return;
      const client = new PresenceClient(c.vaultClient().conn, vault, c.config.device);
      presence = client;
      const beat = async () => {
        if (!live) return;
        const cc = collabRef.current;
        await client.beat({
          name: cc.config.name || 'Someone',
          machine: cc.config.machine,
          project: link.project,
          branch: 'main',
          mode: readOnly ? 'viewing' : 'editing',
        });
        present = othersOn(await client.list(), link.project);
        publish();
      };
      await beat().catch(() => undefined);
      timer = window.setInterval(() => void beat().catch(() => undefined), HEARTBEAT_MS);
    })();

    return () => {
      live = false;
      window.clearInterval(timer);
      void presence?.leave().catch(() => undefined);
      void project?.stop();
      collabRef.current.setOpenProject(null);
    };
  }, [sessionId, collab.config.enabled, connected, sessionRef, depsRef]);
}
