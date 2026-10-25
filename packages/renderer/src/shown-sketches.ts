/**
 * Shown sketches besides the active one, kept for area picking and for dragging. A dragged sketch
 * is drawn moved, like the body built on it (`showMovedPreview`), and the model is rebuilt once on
 * release; a kernel rebuild per pointer step takes 200 ms or more.
 */

import type { Camera } from 'three';
import { nearestSketchArea } from './sketch-area-pick.js';
import type { ShownSketch, SketchAreaHit } from './viewport-api.js';

type Point = { x: number; y: number; z: number };

/** What the scene draws of a shown sketch. */
export interface DrawnSketch {
  plane: ShownSketch['plane'];
  sketch: ShownSketch['sketch'];
  unfilled: ReadonlySet<string>;
}

export class ShownSketches {
  #items: readonly ShownSketch[] = [];
  #moved: { id: string; by: Point } | null = null;
  readonly #draw: (items: readonly DrawnSketch[]) => void;

  constructor(draw: (items: readonly DrawnSketch[]) => void) {
    this.#draw = draw;
  }

  set(items: readonly ShownSketch[]): void {
    // The dragged sketch has arrived where it was let go: it is drawn from there, not moved again.
    const moved = this.#moved;
    if (moved !== null) {
      const was = this.#items.find((item) => item.id === moved.id);
      const now = items.find((item) => item.id === moved.id);
      if (was?.sketch !== now?.sketch || was?.plane !== now?.plane) this.#moved = null;
    }
    this.#items = items;
    this.#redraw();
  }

  /** Draw the sketch `id` moved by `by` in world millimetres; null puts it back. */
  move(id: string | null, by: Point | null): void {
    this.#moved = id === null || by === null ? null : { id, by };
    this.#redraw();
  }

  pick(camera: Camera, pointOn: Parameters<typeof nearestSketchArea>[2]): SketchAreaHit | null {
    return nearestSketchArea(this.#items, camera, pointOn);
  }

  #redraw(): void {
    const moved = this.#moved;
    this.#draw(
      this.#items.map((item) => {
        const plane =
          moved === null || moved.id !== item.id
            ? item.plane
            : {
                ...item.plane,
                origin: {
                  x: item.plane.origin.x + moved.by.x,
                  y: item.plane.origin.y + moved.by.y,
                  z: item.plane.origin.z + moved.by.z,
                },
              };
        return { plane, sketch: item.sketch, unfilled: item.used };
      }),
    );
  }
}
