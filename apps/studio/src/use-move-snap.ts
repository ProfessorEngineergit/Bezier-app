/**
 * Move snapping (`move-snap.ts`) for the gizmo: boxes from the displayed model, zoom from the
 * camera, and a function that maps the requested delta to the snapped one.
 */

import type { BodySummary, StableRef } from '@bezier/core';
import { formatRef } from '@bezier/core';
import { type RefObject, useCallback, useMemo } from 'react';
import type { Point } from './move-gizmo-math.js';
import { type Box, describeHit, snapDelta } from './move-snap.js';
import { type SnapSource, snapBoxes } from './snap-boxes.js';
import type { ViewportHandle } from './Viewport.js';

export interface MoveSnap {
  /** The snapped delta for the requested one, and what it snapped to, if anything. */
  (delta: Point, free: readonly [boolean, boolean, boolean]): { delta: Point; note: string | null };
}

export function useMoveSnap({
  handleRef,
  display,
  bodies,
  selected,
  movingBox,
}: {
  handleRef: RefObject<ViewportHandle | null>;
  display: SnapSource | null;
  bodies: readonly BodySummary[];
  /** The faces being moved; empty when moving an image, which supplies its own box. */
  selected: readonly StableRef[];
  movingBox?: Box | null;
}): MoveSnap | undefined {
  const boxes = useMemo(() => {
    // Match by reference identity first (shared by the display and body list), text only as a
    // fallback: formatting every face cost a tenth of a second on a large assembly.
    const byRef = new Map<StableRef, string>();
    for (const body of bodies) for (const face of body.faces) byRef.set(face, body.label);
    let byText: Map<string, string> | null = null;
    const nameOf = (face: StableRef): string | null => {
      const same = byRef.get(face);
      if (same !== undefined) return same;
      if (byText === null) {
        byText = new Map();
        for (const body of bodies)
          for (const each of body.faces) byText.set(formatRef(each), body.label);
      }
      return byText.get(formatRef(face)) ?? null;
    };
    return snapBoxes(display, selected, nameOf);
  }, [display, bodies, selected]);
  const moving = movingBox ?? boxes.moving;

  const snap = useCallback<MoveSnap>(
    (delta, free) => {
      const handle = handleRef.current;
      if (moving === null || handle === null) return { delta, note: null };
      const eye = handle.cameraPosition();
      const middle: Point = {
        x: (moving.min[0] + moving.max[0]) / 2,
        y: (moving.min[1] + moving.max[1]) / 2,
        z: (moving.min[2] + moving.max[2]) / 2,
      };
      const distance = Math.hypot(eye.x - middle.x, eye.y - middle.y, eye.z - middle.z);
      const result = snapDelta({
        moving,
        others: boxes.others,
        delta: [delta.x, delta.y, delta.z],
        free,
        worldPerPixel: handle.worldPerPixelAt(distance),
      });
      const first = result.hits[0];
      return {
        delta: { x: result.delta[0], y: result.delta[1], z: result.delta[2] },
        note: first === undefined ? null : describeHit(first, boxes.names),
      };
    },
    [boxes, handleRef, moving],
  );
  return moving === null ? undefined : snap;
}
