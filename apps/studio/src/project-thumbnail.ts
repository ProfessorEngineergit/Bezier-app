import { RebuildCache } from '@bezier/core';
import { createViewport } from '@bezier/renderer';
import { captureCard, cardShot } from './card-shot.js';
import { markLearnThumbnail } from './learn-thumbnail.js';
import { Session, type SessionDeps } from './session.js';
import type { ViewportHandle } from './Viewport.js';
import { shownSketches } from './visible-sketch.js';

const LESSON_THUMBNAIL_VERSION = 'last-model-watermark-v2';
let repairs: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<Uint8Array | null>>();

async function keep(session: Session, deps: SessionDeps, shot: Blob | null): Promise<void> {
  if (shot === null || session.isLessonPreview) return;
  const cropped = await cardShot(shot);
  const learned = session.id.startsWith('lesson-');
  const image = learned ? await markLearnThumbnail(cropped) : cropped;
  await deps.store.saveThumbnail(session.id, new Uint8Array(await image.arrayBuffer()));
  if (learned)
    await deps.store.saveWorkspace(session.id, 'lesson-thumbnail', LESSON_THUMBNAIL_VERSION);
}

/** Called before Home or the lesson's Leave hides the model. Never saves a view-only checkpoint. */
export function saveProjectThumbnail(
  session: Session,
  viewport: ViewportHandle,
  deps: SessionDeps,
): Promise<void> {
  if (session.isLessonPreview) return Promise.resolve();
  return captureCard(viewport, document.querySelector('canvas.viewport')).then((shot) =>
    keep(session, deps, shot),
  );
}

/** Repairs older blank lesson pictures from their saved model, without opening or editing it. */
export async function readProjectThumbnail(
  id: string,
  deps: SessionDeps,
): Promise<Uint8Array | null> {
  const image = await deps.store.readThumbnail(id).catch(() => null);
  if (!id.startsWith('lesson-')) return image;
  const version = await deps.store.readWorkspace(id, 'lesson-thumbnail').catch(() => null);
  if (image !== null && version === LESSON_THUMBNAIL_VERSION) return image;
  let work = pending.get(id);
  if (work === undefined) {
    // One small offscreen viewport at a time avoids GPU and kernel memory spikes on a full library.
    work = repairs.then(() => repair(id, deps)).catch(() => image);
    pending.set(id, work);
    repairs = work.finally(() => pending.delete(id));
  }
  return work;
}

async function repair(id: string, deps: SessionDeps): Promise<Uint8Array | null> {
  const quiet: SessionDeps = {
    kernel: deps.kernel,
    solver: deps.solver,
    store: deps.store,
    ...(deps.tessellation === undefined ? {} : { tessellation: deps.tessellation }),
  };
  const session = await Session.open(id, quiet);
  quiet.cache = new RebuildCache(session.document.features.length + 1);
  const canvas = document.createElement('canvas');
  const viewport = createViewport({ canvas, pixelRatio: 1 });
  try {
    const view = await session.rebuild();
    const style = getComputedStyle(document.documentElement);
    viewport.setAppearance(
      style.getPropertyValue('--canvas-top').trim(),
      style.getPropertyValue('--grid-minor').trim(),
      style.getPropertyValue('--grid-major').trim(),
    );
    viewport.setGeometry(view.display);
    viewport.setShownSketches(shownSketches(view.document, view, null));
    await keep(session, quiet, await captureCard(viewport, null));
    return await deps.store.readThumbnail(id);
  } finally {
    viewport.dispose();
    await quiet.cache.clear(deps.kernel);
  }
}
