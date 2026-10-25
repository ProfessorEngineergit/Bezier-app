/**
 * Changing a number by dragging it vertically, as in pro Mac apps: up raises, down lowers, Shift is
 * ten times coarser and Option ten times finer. A click without movement still places the caret for
 * typing.
 */

import { type PointerEvent as ReactPointerEvent, useCallback, useRef } from 'react';

/** Pointer travel before a press counts as a drag, in CSS pixels. */
const THRESHOLD = 3;

export interface ScrubOptions {
  /** The start value, in the units of `step`. */
  value: number;
  /** Change per pixel dragged. */
  step: number;
  onChange: (value: number) => void;
  /** Decimal places while dragging. */
  digits?: number;
}

/** Handlers for a number input: drag it vertically to change it, click to type. */
export function useScrub({ value, step, onChange, digits = 2 }: ScrubOptions) {
  const latest = useRef({ value, step, onChange, digits });
  latest.current = { value, step, onChange, digits };

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    // While typing, the pointer places the caret. Merely focused (a panel opened with the field
    // ready) does not count.
    if (event.button !== 0 || input.dataset.editing !== undefined) return;
    // Prevent focus so a drag does not start a text selection; a click without movement focuses
    // below.
    event.preventDefault();
    const startY = event.clientY;
    const start = latest.current.value;
    let dragging = false;

    const move = (moved: PointerEvent) => {
      const dy = startY - moved.clientY;
      if (!dragging && Math.abs(dy) < THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        document.documentElement.classList.add('scrubbing');
      }
      const factor = moved.shiftKey ? 10 : moved.altKey ? 0.1 : 1;
      const { step: perPixel, digits: places, onChange } = latest.current;
      const next = start + dy * perPixel * factor;
      const scale = 10 ** places;
      onChange(Math.round(next * scale) / scale);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.documentElement.classList.remove('scrubbing');
      if (!dragging) {
        input.dataset.editing = '';
        input.focus();
        input.select();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, []);

  // Typing starts editing too; leaving the field ends it.
  const onKeyDown = useCallback((event: { currentTarget: HTMLInputElement; key: string }) => {
    if (event.key.length === 1 || event.key === 'Backspace') {
      event.currentTarget.dataset.editing = '';
    }
  }, []);
  const onBlur = useCallback((event: { currentTarget: HTMLInputElement }) => {
    delete event.currentTarget.dataset.editing;
  }, []);

  return { onPointerDown, onKeyDownCapture: onKeyDown, onBlurCapture: onBlur, 'data-scrub': '' };
}
