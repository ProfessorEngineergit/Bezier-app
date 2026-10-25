/**
 * Forwards wheel and pinch gestures that start on a gizmo handle to the canvas, so the view still
 * navigates while the pointer rests on the handle.
 */

import { handOnWheel } from '@bezier/renderer';
import { type RefObject, useEffect } from 'react';

export function useWheelThrough(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      const canvas = document.querySelector('canvas.viewport');
      // An input on a gizmo (a typed distance) scrolls its own text.
      if (canvas === null || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      event.stopPropagation();
      // Via the renderer, which preserves what a copied event cannot (wheel-input.ts).
      handOnWheel(event, canvas);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [ref]);
}
