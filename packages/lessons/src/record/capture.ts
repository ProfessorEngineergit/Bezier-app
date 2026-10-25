/**
 * Captures the author's input as lesson events: keys from the window, clicks and pointer moves from
 * the working area in 0 to 1 canvas coordinates. Canvas capture records no cursor, so the player
 * draws the pointer from these events.
 */

import type { LessonEvent } from '../format/manifest.js';
import type { HostViewport } from '../host/contract.js';
import type { RecordingClock } from './clock.js';

/** Pointer sampling interval in seconds (25 Hz). */
const POINTER_GAP = 0.04;

const TYPING = 'input, textarea, select, [contenteditable="true"], dialog, [role="dialog"]';

function modifiersOf(event: KeyboardEvent): string[] {
  const held: string[] = [];
  if (event.metaKey) held.push('meta');
  if (event.ctrlKey) held.push('ctrl');
  if (event.altKey) held.push('alt');
  if (event.shiftKey) held.push('shift');
  return held;
}

export function captureInput(
  viewport: HostViewport,
  clock: RecordingClock,
  onEvent: (event: LessonEvent) => void,
): () => void {
  const { canvas, element } = viewport;
  let lastPointer = -1;

  const position = (event: PointerEvent): { x: number; y: number } | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
  };

  /** Input on the Lessons overlay (the recording bar) is not recorded. */
  const ours = (target: EventTarget | null) =>
    target instanceof Element && target.closest('[data-lessons-overlay]') !== null;

  const onKey = (event: KeyboardEvent) => {
    if (clock.paused() || event.repeat || ours(event.target)) return;
    if (event.target instanceof Element && event.target.closest(TYPING) !== null) return;
    onEvent({
      kind: 'key',
      time: clock.elapsed(),
      code: event.code,
      key: event.key,
      modifiers: modifiersOf(event),
    });
  };

  const onDown = (event: PointerEvent) => {
    if (clock.paused() || ours(event.target)) return;
    const at = position(event);
    if (at !== null) onEvent({ kind: 'click', time: clock.elapsed(), ...at, button: event.button });
  };

  const onMove = (event: PointerEvent) => {
    if (clock.paused() || ours(event.target)) return;
    const time = clock.elapsed();
    if (time - lastPointer < POINTER_GAP) return;
    const at = position(event);
    if (at === null) return;
    lastPointer = time;
    onEvent({ kind: 'pointer', time, ...at });
  };

  window.addEventListener('keydown', onKey, true);
  element.addEventListener('pointerdown', onDown, true);
  element.addEventListener('pointermove', onMove, true);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    element.removeEventListener('pointerdown', onDown, true);
    element.removeEventListener('pointermove', onMove, true);
  };
}
