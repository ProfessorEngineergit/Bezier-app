import { faceSketchBasis, type PlaneBasis, planeToWorld } from '@bezier/core';
import { type PointerEvent, type RefObject, useRef } from 'react';
import type { WorldPoint } from './gizmo-direction.js';
import type { ViewportHandle } from './Viewport.js';

/** Moving a handle changes its placement, never the solid or the operation's axis. */
export function useGizmoAnchor(handleRef: RefObject<ViewportHandle | null>) {
  const offset = useRef({ x: 0, y: 0, z: 0 });
  const drag = useRef<{ plane: PlaneBasis; u: number; v: number; from: WorldPoint } | null>(null);
  const pointAt = (event: PointerEvent<HTMLButtonElement>, plane: PlaneBasis) => {
    const box =
      event.currentTarget
        .closest('.stage')
        ?.querySelector('canvas.viewport')
        ?.getBoundingClientRect() ??
      document.querySelector('canvas.viewport')?.getBoundingClientRect();
    if (!box) return null;
    return (
      handleRef.current?.sketchPoint(event.clientX - box.left, event.clientY - box.top, plane) ??
      null
    );
  };
  return {
    offset,
    start(event: PointerEvent<HTMLButtonElement>, anchor: WorldPoint, normal: WorldPoint) {
      if (event.button !== 0 || Math.hypot(normal.x, normal.y, normal.z) < 1e-8) return;
      const plane = faceSketchBasis(anchor, normal);
      const at = pointAt(event, plane);
      if (!at) return;
      drag.current = { plane, ...at, from: { ...offset.current } };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    },
    move(event: PointerEvent<HTMLButtonElement>) {
      const state = drag.current;
      if (!state) return;
      const at = pointAt(event, state.plane);
      if (!at) return;
      const delta = planeToWorld(
        { ...state.plane, origin: { x: 0, y: 0, z: 0 } },
        at.u - state.u,
        at.v - state.v,
      );
      offset.current = {
        x: state.from.x + delta.x,
        y: state.from.y + delta.y,
        z: state.from.z + delta.z,
      };
      event.stopPropagation();
    },
    end(event: PointerEvent<HTMLButtonElement>) {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      event.stopPropagation();
    },
    cancel(event: PointerEvent<HTMLButtonElement>) {
      if (drag.current) offset.current = { ...drag.current.from };
      drag.current = null;
      event.stopPropagation();
    },
  };
}
