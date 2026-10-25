import { useEffect, useState } from 'react';
import { useLessons, useLessonsState } from '../app/context.js';
import type { LessonSummary } from '../format/summary.js';
import { type Draft, deleteDraft, draftHasMedia, listDrafts } from '../record/drafts.js';
import { listLessons, loadProgress, type Progress } from '../store/library.js';

export interface Library {
  lessons: LessonSummary[];
  progress: Map<string, Progress>;
  /** Recordings interrupted by a reload, oldest first. */
  drafts: Draft[];
  loading: boolean;
  error: string | null;
  /** The library version this was read at (src/app/state.ts). */
  version: number;
}

const EMPTY: Library = {
  lessons: [],
  progress: new Map(),
  drafts: [],
  loading: true,
  error: null,
  version: -1,
};

/** Drops drafts with no stored media, and the one currently recording. */
async function draftsWorthKeeping(drafts: Draft[], recording: string | undefined) {
  const kept: Draft[] = [];
  for (const draft of drafts) {
    if (draft.id === recording) continue;
    if (await draftHasMedia(draft.id)) kept.push(draft);
    else await deleteDraft(draft.id);
  }
  return kept.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** All lessons on this device, reloaded whenever one is stored or deleted. */
export function useLibrary(): Library {
  const lessons = useLessons();
  const { libraryVersion, recording } = useLessonsState();
  const [library, setLibrary] = useState<Library>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listLessons(), loadProgress(), listDrafts()])
      .then(async ([list, progress, drafts]) => ({
        lessons: list,
        progress,
        drafts: await draftsWorthKeeping(drafts, recording?.id),
      }))
      .then((loaded) => {
        if (!cancelled) {
          setLibrary({ ...loaded, loading: false, error: null, version: libraryVersion });
        }
      })
      .catch((problem: unknown) => {
        console.error(problem);
        if (cancelled) return;
        setLibrary((current) => ({
          ...current,
          loading: false,
          error: 'The lessons on this device could not be read; reload to try again.',
        }));
        lessons.complain(problem, 'The lessons on this device could not be read.');
      });
    return () => {
      cancelled = true;
    };
  }, [libraryVersion, recording, lessons]);

  return library;
}
