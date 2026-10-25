import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Drags an item along the timeline with pointer capture. `onMove` receives `from` plus the pointer
 * offset in seconds, so the item keeps its position relative to the pointer instead of jumping.
 */
export function drag(
  event: ReactPointerEvent<HTMLElement>,
  pixelsPerSecond: number,
  from: number,
  onMove: (time: number) => void,
  onEnd?: () => void,
) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const target = event.currentTarget;
  const startX = event.clientX;
  const id = event.pointerId;
  target.setPointerCapture(id);
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    onMove(from + (e.clientX - startX) / pixelsPerSecond);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    onEnd?.();
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}
