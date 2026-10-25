/**
 * The recording in progress, persisted to IndexedDB. Media chunks are written as they arrive and
 * events and checkpoints shortly after, so a reload loses at most the last second or two.
 */

import type {
  LessonEvent,
  LessonLevel,
  LessonManifest,
  LessonState,
  StoredLesson,
} from '../format/manifest.js';
import { APP_DATABASE } from '../store/app-database.js';
import { getAll, request, transact } from '../store/database.js';

export interface Draft {
  id: string;
  title: string;
  level: LessonLevel;
  startedAt: string;
  /** Seconds recorded so far. */
  elapsed: number;
  events: LessonEvent[];
  states: LessonState[];
  viewportType: string;
  cameraType?: string;
}

export type ChunkKind = 'viewport' | 'camera';

interface ChunkRow {
  draft: string;
  kind: ChunkKind;
  seq: number;
  bytes: Uint8Array;
}

export function saveDraft(draft: Draft): Promise<void> {
  return transact(APP_DATABASE, 'drafts', 'readwrite', async (store) => {
    await request(store('drafts').put(draft));
  });
}

/** Stores bytes rather than the blob: WebKit cannot structured-clone a `MediaRecorder` blob. */
export async function appendChunk(draft: string, kind: ChunkKind, seq: number, chunk: Blob) {
  const bytes = new Uint8Array(await chunk.arrayBuffer());
  const row: ChunkRow = { draft, kind, seq, bytes };
  await transact(APP_DATABASE, 'chunks', 'readwrite', async (store) => {
    await request(store('chunks').add(row));
  });
}

export function listDrafts(): Promise<Draft[]> {
  return transact(APP_DATABASE, 'drafts', 'readonly', (store) => getAll<Draft>(store('drafts')));
}

async function chunksOf(draft: string): Promise<ChunkRow[]> {
  const rows = await transact(APP_DATABASE, 'chunks', 'readonly', (store) =>
    getAll<ChunkRow>(store('chunks').index('draft'), IDBKeyRange.only(draft)),
  );
  return rows.sort((a, b) => a.seq - b.seq);
}

export function deleteDraft(draft: string): Promise<void> {
  return transact(APP_DATABASE, ['drafts', 'chunks'], 'readwrite', async (store) => {
    await request(store('drafts').delete(draft));
    const keys = await request(store('chunks').index('draft').getAllKeys(IDBKeyRange.only(draft)));
    for (const key of keys) await request(store('chunks').delete(key));
  });
}

/** Whether any media of the draft was stored. */
export async function draftHasMedia(draft: string): Promise<boolean> {
  const count = await transact(APP_DATABASE, 'chunks', 'readonly', (store) =>
    request(store('chunks').index('draft').count(IDBKeyRange.only(draft))),
  );
  return count > 0;
}

export function manifestFromDraft(draft: Draft, duration: number): LessonManifest {
  return {
    format: 'bezier-lesson',
    version: 1,
    id: draft.id,
    title: draft.title.trim() || 'Untitled lesson',
    description: '',
    level: draft.level,
    createdAt: draft.startedAt,
    duration,
    viewportType: draft.viewportType,
    ...(draft.cameraType === undefined ? {} : { cameraType: draft.cameraType }),
    events: draft.events,
    states: draft.states,
    cuts: [{ start: 0, end: duration }],
    avatar: [{ time: 0, corner: 'bottom-right' }],
    completed: false,
  };
}

/** Builds a lesson from everything stored for an interrupted recording. */
export async function draftToLesson(draft: Draft): Promise<StoredLesson> {
  const rows = await chunksOf(draft.id);
  const parts = (kind: ChunkKind) =>
    rows.filter((row) => row.kind === kind).map((row) => row.bytes);
  const viewportParts = parts('viewport');
  if (viewportParts.length === 0) {
    throw new Error('Nothing of this recording reached the disk before it was interrupted.');
  }
  const viewport = new Blob(viewportParts as BlobPart[], { type: draft.viewportType });
  const cameraParts = parts('camera');
  const camera =
    draft.cameraType !== undefined && cameraParts.length > 0
      ? new Blob(cameraParts as BlobPart[], { type: draft.cameraType })
      : undefined;
  return {
    manifest: manifestFromDraft(draft, draft.elapsed),
    viewport,
    ...(camera === undefined ? {} : { camera }),
  };
}
