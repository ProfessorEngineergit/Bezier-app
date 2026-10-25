/**
 * The start page library: projects, folders and folder membership, via the store (`readIndex`,
 * `createFolder`, `renameFolder`, `deleteFolder`, `moveToFolder`, `duplicate`). Every mutation
 * re-reads from the store rather than patching local state, since the index and document list are
 * two files that could drift.
 */

import type { DashboardIndex } from '@bezier/storage';
import { emptyIndex } from '@bezier/storage';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentInfo } from './boot.js';
import { readProjectThumbnail } from './project-thumbnail.js';
import type { SessionDeps } from './session.js';

export interface LibraryHandle {
  /**
   * Whether the projects have been read at least once. Until then the page must not say "No
   * projects yet", which invited New Project on a full library.
   */
  loaded: boolean;
  index: DashboardIndex;
  /** Object URLs of project pictures, where present. */
  thumbnails: Record<string, string>;
  /** The open folder; null is the top level. */
  openFolder: string | null;
  setOpenFolder: (id: string | null) => void;
  newFolder: (name: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveToFolder: (docId: string, folderId: string | null) => void;
  renameProject: (docId: string, name: string) => void;
  duplicate: (docId: string, name: string) => void;
  refresh: (changed?: string) => void;
  /** The project store once the app has started; shared projects are copied into it. */
  store: () => SessionDeps['store'] | null;
}

interface LibraryDeps {
  depsRef: MutableRefObject<SessionDeps | null>;
  say: (message: string) => void;
  setDocuments: (docs: readonly DocumentInfo[]) => void;
}

export function useLibrary({ depsRef, say, setDocuments }: LibraryDeps): LibraryHandle {
  const [index, setIndex] = useState<DashboardIndex>(emptyIndex);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  /**
   * One object URL per project, kept between refreshes. A picture only changes when its project is
   * left (`changed`), so only that one is re-read; re-decoding all of them made the cards flash.
   */
  const pictures = useRef(new Map<string, string>());
  // Reads overlap and storage may answer out of order, so a read begun before a delete could
  // restore the deleted project. Only the latest read applies.
  const latestRead = useRef(0);

  const refresh = useCallback(
    (changed?: string) => {
      const deps = depsRef.current;
      if (deps === null) return;
      const read = ++latestRead.current;
      void Promise.all([deps.store.readIndex(), deps.store.listDocuments()])
        .then(async ([next, docs]) => {
          if (read !== latestRead.current) return;
          setIndex(next);
          setDocuments(docs);
          setLoaded(true);

          const kept = pictures.current;
          const fresh = new Map<string, string>();
          await Promise.all(
            docs.map(async (doc) => {
              const known = kept.get(doc.id);
              if (known !== undefined && doc.id !== changed) {
                fresh.set(doc.id, known);
                return;
              }
              const png = await readProjectThumbnail(doc.id, deps).catch(() => null);
              if (png === null) return;
              const blob = new Blob([new Uint8Array(png)], { type: 'image/png' });
              fresh.set(doc.id, URL.createObjectURL(blob));
            }),
          );
          if (read !== latestRead.current) {
            // Superseded while pictures loaded: the newer read owns the map.
            for (const [id, url] of fresh) if (kept.get(id) !== url) URL.revokeObjectURL(url);
            return;
          }
          // Revoke URLs that were replaced or whose project is gone.
          for (const [id, url] of kept) if (fresh.get(id) !== url) URL.revokeObjectURL(url);
          pictures.current = fresh;
          setThumbnails(Object.fromEntries(fresh));
        })
        .catch((error: unknown) => {
          // Otherwise the loading state would hide the failure.
          setLoaded(true);
          say(error instanceof Error ? error.message : String(error));
        });
    },
    [depsRef, say, setDocuments],
  );

  // The store is not ready on first render; boot fills the ref shortly after. Polling is cheaper
  // than threading a readiness flag through every caller.
  useEffect(() => {
    if (depsRef.current !== null) {
      refresh();
      return;
    }
    const timer = window.setInterval(() => {
      if (depsRef.current === null) return;
      window.clearInterval(timer);
      refresh();
    }, 120);
    return () => window.clearInterval(timer);
  }, [depsRef, refresh]);

  /** Runs a store call and re-reads afterwards. */
  const change = useCallback(
    (work: (deps: SessionDeps) => Promise<unknown>) => {
      const deps = depsRef.current;
      if (deps === null) return;
      void work(deps)
        .then(() => refresh())
        .catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));
    },
    [depsRef, refresh, say],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      // Deleting a folder moves its documents to the top level. Leave the folder view if it was the
      // one deleted.
      setOpenFolder((current) => (current === id ? null : current));
      change((deps) => deps.store.deleteFolder(id));
    },
    [change],
  );

  return {
    loaded,
    index,
    thumbnails,
    openFolder,
    setOpenFolder,
    refresh,
    store: useCallback(() => depsRef.current?.store ?? null, [depsRef]),
    newFolder: useCallback(
      (name: string) => change((deps) => deps.store.createFolder(name)),
      [change],
    ),
    renameFolder: useCallback(
      (id: string, name: string) => change((deps) => deps.store.renameFolder(id, name)),
      [change],
    ),
    deleteFolder,
    moveToFolder: useCallback(
      (docId: string, folderId: string | null) =>
        change((deps) => deps.store.moveToFolder(docId, folderId)),
      [change],
    ),
    renameProject: useCallback(
      (docId: string, name: string) => change((deps) => deps.store.rename(docId, name)),
      [change],
    ),
    duplicate: useCallback(
      (docId: string, name: string) =>
        change((deps) => deps.store.duplicate(docId, `${docId}-copy-${Date.now()}`, name)),
      [change],
    ),
  };
}
