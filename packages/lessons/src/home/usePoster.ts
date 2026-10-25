/**
 * Poster frames for lesson cards, captured once just after the last checkpoint and stored in the
 * app database. Captures run one at a time so a page of cards does not load every video at once.
 */

import { useEffect, useState } from 'react';
import { useLessons } from '../app/context.js';
import type { Lessons } from '../app/lessons.js';
import type { LessonManifest } from '../format/manifest.js';
import { getPoster, putPoster } from '../store/library.js';

const POSTER_WIDTH = 480;
const urls = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

/** Just after the last checkpoint, showing the finished model. */
function posterMoment(manifest: LessonManifest): number {
  const last = manifest.states.at(-1)?.time ?? 0;
  return Math.max(0, Math.min(last + 0.5, manifest.duration - 0.05));
}

const once = (target: EventTarget, name: string) =>
  new Promise<void>((resolve) => target.addEventListener(name, () => resolve(), { once: true }));

export async function captureFrame(video: Blob, at: number): Promise<Blob> {
  const element = document.createElement('video');
  const url = URL.createObjectURL(video);
  try {
    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    element.src = url;
    const timeout = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error('The video took too long to show a frame.')), 8000),
    );
    await Promise.race([once(element, 'loadeddata'), timeout]);
    if (at > 0) {
      element.currentTime = at;
      await Promise.race([once(element, 'seeked'), timeout]);
    }
    const width = element.videoWidth || 16;
    const height = element.videoHeight || 10;
    const canvas = document.createElement('canvas');
    canvas.width = POSTER_WIDTH;
    canvas.height = Math.round((POSTER_WIDTH * height) / width);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('No drawing context for the poster.');
    ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob === null ? reject(new Error('The poster could not be encoded.')) : resolve(blob),
        'image/jpeg',
        0.72,
      ),
    );
  } finally {
    element.removeAttribute('src');
    element.load();
    URL.revokeObjectURL(url);
  }
}

async function makePoster(id: string, lessons: Lessons): Promise<string | null> {
  try {
    let image = await getPoster(id);
    if (image === undefined) {
      const lesson = await lessons.load(id);
      image = await captureFrame(lesson.viewport, posterMoment(lesson.manifest));
      await putPoster(id, image);
    }
    return URL.createObjectURL(image);
  } catch (problem) {
    console.error(problem);
    return null;
  }
}

/** Drops the cached URL; the poster is reloaded the next time it is shown. */
export function forgetPosterUrl(id: string): void {
  urls.delete(id);
}

export function usePoster(id: string): string | null {
  const lessons = useLessons();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pending = urls.get(id);
    if (pending === undefined) {
      pending = queue.then(() => makePoster(id, lessons));
      queue = pending.catch(() => undefined);
      urls.set(id, pending);
    }
    void pending.then((made) => {
      if (!cancelled) setUrl(made);
    });
    return () => {
      cancelled = true;
    };
  }, [id, lessons]);

  return url;
}
