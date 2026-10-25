/**
 * Adds every shared project this device can open to the library, so it opens like any other.
 * Runs while the start page is visible, on vault changes and every minute. Only adds: open
 * projects are kept current by `live-project.ts`, and unshared ones stay as ordinary projects.
 */

import { useEffect, useRef } from 'react';
import { useCollab } from './CollabProvider.js';
import { links } from './collab-store.js';
import { download, type LocalProjects } from './shared-projects.js';

const EVERY_MS = 60_000;

export function useSharedLibrary(library: {
  store: () => LocalProjects | null;
  refresh: () => void;
}): void {
  const collab = useCollab();
  const collabRef = useRef(collab);
  collabRef.current = collab;
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const key = [...collab.vaults, ...collab.links].map((v) => `${v.id}:${v.role}`).join(',');

  useEffect(() => {
    if (!collab.config.enabled || key === '') return;
    let running = false;
    const sync = async () => {
      const store = libraryRef.current.store();
      if (running || store === null) return;
      running = true;
      let added = 0;
      try {
        const c = collabRef.current;
        for (const vault of [
          ...c.vaults,
          ...c.links.filter((l) => !c.vaults.some((v) => v.id === l.id)),
        ]) {
          try {
            const ws = await c.workspace(vault);
            const readOnly = vault.role === 'reader' || c.isLink(vault.id);
            for (const project of Object.keys((await ws.state()).tree)) {
              const result = await download(await c.liveChannel(vault, project), ws, store, links, {
                vault: vault.id,
                project,
                readOnly,
              }).catch(() => null);
              if (result?.added === true) added += 1;
            }
          } catch {
            // One unreachable vault does not block the others.
          }
        }
      } finally {
        running = false;
      }
      if (added > 0) libraryRef.current.refresh();
    };
    void sync();
    const timer = window.setInterval(() => void sync(), EVERY_MS);
    return () => window.clearInterval(timer);
  }, [key, collab.config.enabled]);
}
