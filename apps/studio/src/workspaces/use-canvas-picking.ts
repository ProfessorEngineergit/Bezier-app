/**
 * Pointer input on the Visualize canvas: the hovered face is highlighted, a click picks it (Shift
 * adds), and a double click picks its whole body, so a material then applies to the body except
 * faces with their own. A click is a press and release in nearly the same place, so camera drags
 * pick nothing.
 */

import type { PresentationRenderer } from '@bezier/renderer';
import type { MouseEvent, PointerEvent, RefObject } from 'react';
import { useRef } from 'react';
import type { useFaceColours } from './use-face-colours.js';

/** How far, in pixels, a press may travel and still be a click. */
const CLICK_SLOP = 5;

export function useCanvasPicking({
  engine,
  faces,
  onSelectBody,
  pointIn,
}: {
  engine: RefObject<PresentationRenderer | null>;
  faces: ReturnType<typeof useFaceColours>;
  onSelectBody: (key: string, additive: boolean) => void;
  pointIn: (clientX: number, clientY: number) => { x: number; y: number } | null;
}) {
  const pointerDown = useRef({ x: 0, y: 0 });
  return {
    onPointerDown: (event: PointerEvent) => {
      pointerDown.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        Math.hypot(event.clientX - pointerDown.current.x, event.clientY - pointerDown.current.y) >
          CLICK_SLOP
      )
        return;
      // The second press of a double click is handled as a body pick below, not a face pick.
      if (event.detail > 1) return;
      const at = pointIn(event.clientX, event.clientY);
      const hit = at && engine.current?.pickFace(at.x, at.y);
      faces.pick(hit ? hit.face : null, event.shiftKey);
    },
    onDoubleClick: (event: MouseEvent) => {
      const at = pointIn(event.clientX, event.clientY);
      const key = at && engine.current?.pickBody(at.x, at.y);
      if (!key) return;
      faces.clear();
      onSelectBody(key, event.shiftKey);
    },
    onPointerMove: (event: PointerEvent) => {
      if (event.buttons !== 0) return;
      const at = pointIn(event.clientX, event.clientY);
      const hit = at && engine.current?.pickFace(at.x, at.y);
      faces.setHover(hit ? hit.face : null);
    },
    onPointerLeave: () => faces.setHover(null),
  };
}
