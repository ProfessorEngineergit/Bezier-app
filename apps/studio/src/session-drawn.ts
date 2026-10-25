/**
 * Recent drawings, keyed by body. A body from the rebuild cache draws exactly as before, so Undo
 * can reuse the drawing instead of meshing and naming again (0.5 of 0.8 s for an Undo beside the
 * Voron, WebKit). The key also covers what the drawing reads: feature order (body names), hidden
 * state and names.
 *
 * Stored per rebuild cache, not per session, so reopening a project reuses them (audit F-062). A
 * new cache, after an engine restart, starts a new list.
 */
import type { BodySummary, CadDocument, TessellationChoice } from '@bezier/core';
import type { ShapeId } from '@bezier/kernel';
import type { DisplayGeometry } from '@bezier/renderer';

export interface Drawing {
  tessellation: TessellationChoice | undefined;
  bodies: readonly BodySummary[];
  display: DisplayGeometry | null;
}

/** Few, since each keeps a model's triangles alive. */
const KEPT = 3;

export class Drawings {
  readonly #map = new Map<string, Drawing>();

  static keyOf(body: ShapeId, document: CadDocument): string {
    const meta = document.meta;
    return JSON.stringify([
      body,
      document.features.map((feature) => feature.id),
      meta.hiddenBodies ?? [],
      meta.bodyNames ?? {},
    ]);
  }

  get(key: string): Drawing | undefined {
    return this.#map.get(key);
  }

  remember(key: string, drawing: Drawing): void {
    this.#map.delete(key);
    this.#map.set(key, drawing);
    while (this.#map.size > KEPT) {
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      this.#map.delete(oldest);
    }
  }

  clear(): void {
    this.#map.clear();
  }
}

/**
 * Whether `choice` would draw this body the same as the existing drawing. Compares the effective
 * result, not the setting: Automatic already draws a large model light, so switching to Light
 * must not redraw all 1715 Voron solids.
 */
export function drawsTheSame(drawing: Drawing, choice: TessellationChoice | undefined): boolean {
  if (drawing.tessellation === choice) return true;
  const faces = drawing.display?.faceRefs.length ?? 0;
  const resolve = (each: TessellationChoice | undefined) =>
    typeof each === 'function' ? each(faces) : each;
  return JSON.stringify(resolve(drawing.tessellation)) === JSON.stringify(resolve(choice));
}

const byCache = new WeakMap<object, Drawings>();

/** The drawings stored with this rebuild cache, or `own` without one. */
export function drawingsFor(cache: object | undefined, own: Drawings): Drawings {
  if (cache === undefined) return own;
  let drawings = byCache.get(cache);
  if (drawings === undefined) {
    drawings = new Drawings();
    byCache.set(cache, drawings);
  }
  return drawings;
}
