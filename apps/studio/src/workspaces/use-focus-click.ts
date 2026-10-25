/**
 * A right click on the picture sets the focus plane, as in camera apps; a right drag orbits and
 * must not. The context menu fires on release on Windows and Linux but on press on macOS, so the
 * focus is set on right-button release near the press point on every system, and the context menu
 * is only suppressed.
 */

import { type MouseEvent, type PointerEvent, useRef } from 'react';

/** Movement beyond which a right press is a drag, in CSS pixels. */
const STILL = 4;

export function useFocusClick(focus: (clientX: number, clientY: number) => void) {
  const down = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDownCapture: (event: PointerEvent) => {
      if (event.button === 2) down.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUpCapture: (event: PointerEvent) => {
      const from = down.current;
      if (event.button !== 2 || from === null) return;
      down.current = null;
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) <= STILL)
        focus(event.clientX, event.clientY);
    },
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  };
}
