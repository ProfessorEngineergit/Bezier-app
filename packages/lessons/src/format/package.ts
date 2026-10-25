/**
 * `.bezierlesson` packages: a zip of the manifest and its videos. Layout (docs/lesson-format.md):
 * `manifest.json`, `viewport.mp4` or `viewport.webm`, and optionally `camera.mp4` or `camera.webm`.
 * Entries are stored uncompressed: video does not compress and a stored zip opens instantly.
 */

import { strFromU8, strToU8, unzip, zip } from 'fflate';
import { isManifest, type StoredLesson } from './manifest.js';

/** Packages are untrusted, so sizes are checked before anything is expanded. */
const MAX_PACKAGE = 512_000_000;
const MAX_MANIFEST = 20_000_000;
const ENTRIES = ['manifest.json', 'viewport.webm', 'viewport.mp4', 'camera.webm', 'camera.mp4'];

const extension = (type: string | undefined) => (type?.startsWith('video/mp4') ? 'mp4' : 'webm');

export async function writePackage(lesson: StoredLesson): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(lesson.manifest)),
    [`viewport.${extension(lesson.manifest.viewportType)}`]: new Uint8Array(
      await lesson.viewport.arrayBuffer(),
    ),
  };
  if (lesson.camera !== undefined) {
    entries[`camera.${extension(lesson.manifest.cameraType)}`] = new Uint8Array(
      await lesson.camera.arrayBuffer(),
    );
  }
  return new Promise((resolve, reject) => {
    zip(entries, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

/**
 * Reads a package as a lesson with a fresh id, marked not completed. Throws a user-facing error
 * when the package cannot be played.
 */
export async function readPackage(bytes: Uint8Array): Promise<StoredLesson> {
  if (bytes.byteLength > MAX_PACKAGE)
    throw new Error('Lesson packages must be smaller than 512 MB.');
  let expanded = 0;
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      bytes,
      {
        filter: (entry) => {
          if (!ENTRIES.includes(entry.name)) return false;
          expanded += entry.originalSize;
          return (
            expanded <= MAX_PACKAGE &&
            (entry.name !== 'manifest.json' || entry.originalSize <= MAX_MANIFEST)
          );
        },
      },
      (error, data) => (error ? reject(error) : resolve(data)),
    );
  });
  const raw = files['manifest.json'];
  const viewport = files['viewport.mp4'] ?? files['viewport.webm'];
  if (raw === undefined || viewport === undefined) {
    throw new Error('This package has no lesson in it.');
  }
  const manifest: unknown = JSON.parse(strFromU8(raw));
  if (!isManifest(manifest))
    throw new Error('This lesson was made in a format this app cannot read.');
  const camera = files['camera.mp4'] ?? files['camera.webm'];
  return {
    manifest: { ...manifest, id: crypto.randomUUID(), completed: false },
    viewport: new Blob([viewport as BlobPart], { type: manifest.viewportType }),
    ...(camera === undefined
      ? {}
      : { camera: new Blob([camera as BlobPart], { type: manifest.cameraType ?? 'video/webm' }) }),
  };
}
