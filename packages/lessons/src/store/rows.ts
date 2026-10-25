/**
 * Conversion between lessons and rows of the `lessons` store. The row shape is a compatibility
 * contract (docs/lesson-format.md). Media is stored as bytes because WebKit cannot reliably
 * structured-clone a `MediaRecorder` blob; older rows hold `Blob`s. Both are read.
 */

import { isManifest, type LessonManifest, type StoredLesson } from '../format/manifest.js';

export interface LessonRow {
  id: string;
  manifest: LessonManifest;
  viewportBytes?: Uint8Array;
  cameraBytes?: Uint8Array;
  viewport?: Blob;
  camera?: Blob;
}

const isBytes = (value: unknown): value is Uint8Array => value instanceof Uint8Array;
const isBlob = (value: unknown): value is Blob =>
  typeof Blob !== 'undefined' && value instanceof Blob;

/** Whether a row is playable; other rows are ignored. */
export function isLessonRow(value: unknown): value is LessonRow {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Partial<LessonRow>;
  return (
    typeof row.id === 'string' &&
    isManifest(row.manifest) &&
    (row.viewportBytes === undefined || isBytes(row.viewportBytes)) &&
    (row.cameraBytes === undefined || isBytes(row.cameraBytes)) &&
    (row.viewport === undefined || isBlob(row.viewport)) &&
    (row.camera === undefined || isBlob(row.camera))
  );
}

const blobFrom = (bytes: Uint8Array | undefined, blob: Blob | undefined, type: string) =>
  bytes !== undefined ? new Blob([bytes as BlobPart], { type }) : blob;

export function rowToLesson(row: LessonRow): StoredLesson {
  const viewport = blobFrom(row.viewportBytes, row.viewport, row.manifest.viewportType);
  if (viewport === undefined) {
    throw new Error('This lesson has lost its recording and cannot be played.');
  }
  const camera = blobFrom(row.cameraBytes, row.camera, row.manifest.cameraType ?? 'video/webm');
  return { manifest: row.manifest, viewport, ...(camera === undefined ? {} : { camera }) };
}

export async function rowFromLesson(lesson: StoredLesson): Promise<LessonRow> {
  return {
    id: lesson.manifest.id,
    manifest: lesson.manifest,
    viewportBytes: new Uint8Array(await lesson.viewport.arrayBuffer()),
    ...(lesson.camera === undefined
      ? {}
      : { cameraBytes: new Uint8Array(await lesson.camera.arrayBuffer()) }),
  };
}

/** Media size of a row in bytes, in either storage form. */
export function rowBytes(row: LessonRow): number {
  return (
    (row.viewportBytes?.byteLength ?? row.viewport?.size ?? 0) +
    (row.cameraBytes?.byteLength ?? row.camera?.size ?? 0)
  );
}
