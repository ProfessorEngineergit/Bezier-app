/**
 * Automated checks on uploaded lessons before human review.
 *
 * The package is rebuilt from the validated parts, so the stored zip is never the uploader's:
 * extra entries, odd names and oversized headers are dropped.
 */

import { createHash } from 'node:crypto';
import { unzip } from 'fflate';
import type { LessonManifest } from '../../src/format/manifest.js';
import { readPackage, writePackage } from '../../src/format/package.js';
import { LIMITS } from '../client/limits.js';
import { checkText } from './text-filter.js';

/** A rejection whose message is shown to the uploader. */
export class Rejected extends Error {}

export interface Accepted {
  manifest: LessonManifest;
  bytes: Uint8Array;
  /**
   * SHA-256 of the recording. Packages differ per upload (they carry the server's id) but the video
   * does not, so this identifies duplicate lessons.
   */
  contentHash: string;
}

const ENTRY_NAMES = ['manifest.json', 'viewport.webm', 'viewport.mp4', 'camera.webm', 'camera.mp4'];

/**
 * Lists the zip's entries without expanding them. Entries must be stored (uncompressed), so their
 * declared size is their real size and no zip bomb is possible.
 */
function listEntries(bytes: Uint8Array): Promise<{ name: string; compression: number }[]> {
  const seen: { name: string; compression: number }[] = [];
  return new Promise((resolve, reject) => {
    unzip(
      bytes,
      {
        filter: (entry) => {
          seen.push({ name: entry.name, compression: entry.compression });
          return false;
        },
      },
      (error) => (error ? reject(error) : resolve(seen)),
    );
  });
}

const isMp4 = (b: Uint8Array) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
const isWebm = (b: Uint8Array) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;

/** Checks the video signature matches its declared type, since browsers sniff content. */
async function checkVideo(blob: Blob, type: string, label: string): Promise<void> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ok = type.startsWith('video/mp4') ? isMp4(head) : isWebm(head);
  if (!ok) throw new Rejected(`The ${label} is not a valid ${type.split(';')[0]} video.`);
}

function checkText_(text: string, blocklist: readonly string[], field: string): void {
  const problem = checkText(text, blocklist, field);
  if (problem !== null) throw new Rejected(problem);
}

function checkManifest(m: LessonManifest, blocklist: readonly string[]): void {
  if (m.title.trim() === '') throw new Rejected('Give the lesson a title.');
  if (m.title.length > LIMITS.title) {
    throw new Rejected(`The title may be at most ${LIMITS.title} characters.`);
  }
  if (m.description.length > LIMITS.description) {
    throw new Rejected(`The description may be at most ${LIMITS.description} characters.`);
  }
  if (m.duration <= 0 || m.duration > LIMITS.durationSeconds) {
    throw new Rejected(
      `Lessons must be between 1 second and ${LIMITS.durationSeconds / 60} minutes.`,
    );
  }
  if (
    m.states.length > LIMITS.states ||
    m.events.length > LIMITS.events ||
    m.cuts.length > LIMITS.cuts ||
    m.avatar.length > LIMITS.avatarCues
  ) {
    throw new Rejected(
      'This lesson has more checkpoints or recorded events than a community lesson may.',
    );
  }
  checkText_(m.title, blocklist, 'title');
  checkText_(m.description, blocklist, 'description');
  for (const state of m.states) {
    if (state.title.length > LIMITS.chapterTitle) {
      throw new Rejected(`Chapter names may be at most ${LIMITS.chapterTitle} characters.`);
    }
    checkText_(state.title, blocklist, 'chapter names');
    if (state.project.length > LIMITS.projectBytes) {
      throw new Rejected('One of the checkpoints holds a model that is too large to share.');
    }
    try {
      const project: unknown = JSON.parse(state.project);
      if (project === null || typeof project !== 'object') throw new Error('not an object');
    } catch {
      throw new Rejected('One of the checkpoints does not hold a Bezier model.');
    }
  }
  for (const event of m.events) {
    if (event.kind === 'edit') checkText_(event.title.slice(0, 500), blocklist, 'edit names');
  }
}

export async function inspectUpload(
  bytes: Uint8Array,
  id: string,
  blocklist: readonly string[],
): Promise<Accepted> {
  if (bytes.byteLength > LIMITS.packageBytes) {
    throw new Rejected(`Packages may be at most ${LIMITS.packageBytes / 1_000_000} MB.`);
  }
  let entries: { name: string; compression: number }[];
  try {
    entries = await listEntries(bytes);
  } catch {
    throw new Rejected('This file is not a .bezierlesson package.');
  }
  const names = entries.map((entry) => entry.name);
  if (new Set(names).size !== names.length) throw new Rejected('This package lists a file twice.');
  if (entries.some((e) => ENTRY_NAMES.includes(e.name) && e.compression !== 0)) {
    throw new Rejected('Export the lesson again from Bezier: this package is compressed.');
  }
  let lesson: Awaited<ReturnType<typeof readPackage>>;
  try {
    lesson = await readPackage(bytes);
  } catch (error) {
    throw new Rejected(error instanceof Error ? error.message : 'This lesson cannot be read.');
  }
  const manifest: LessonManifest = {
    ...lesson.manifest,
    id,
    title: lesson.manifest.title.trim(),
    description: lesson.manifest.description.trim(),
    completed: false,
  };
  checkManifest(manifest, blocklist);
  await checkVideo(lesson.viewport, manifest.viewportType, 'recording');
  if (lesson.camera !== undefined) {
    await checkVideo(lesson.camera, manifest.cameraType ?? 'video/webm', 'camera video');
  }
  const rebuilt = await writePackage({ ...lesson, manifest });
  if (rebuilt.byteLength > LIMITS.packageBytes) {
    throw new Rejected(`Packages may be at most ${LIMITS.packageBytes / 1_000_000} MB.`);
  }
  const contentHash = createHash('sha256')
    .update(new Uint8Array(await lesson.viewport.arrayBuffer()))
    .digest('hex');
  return { manifest, bytes: rebuilt, contentHash };
}
