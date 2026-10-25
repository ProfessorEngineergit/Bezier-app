/**
 * How hard the machine is working, for Nib: frames per second averaged over a few seconds, so one
 * heavy moment (a rebuild, an import) does not read as a slow machine. Measured only while a
 * project is open and the window is visible. One increment per frame, no allocation (ADR 0007).
 */

import type { Strain } from '@bezier/nib';

/** Below these many frames a second, averaged, the machine is slow, or struggling. */
const SLOW = 24;
const STRUGGLING = 12;
/** Seconds averaged over. */
const SPAN = 4;

/** A project is open and visible, the only case where frame rate reflects the model. */
function measuring(): boolean {
  return (
    !document.hidden &&
    document.querySelector('.library[data-loaded]') === null &&
    document.querySelector('canvas.viewport') !== null
  );
}

/** Tells `onStrain` each time the level changes. Returns the way to stop. */
export function watchStrain(onStrain: (strain: Strain) => void): () => void {
  let frames = 0;
  let frame = 0;
  const seconds = new Float64Array(SPAN);
  let filled = 0;
  let at = 0;
  let level: Strain = 0;
  const count = () => {
    frames += 1;
    frame = requestAnimationFrame(count);
  };
  frame = requestAnimationFrame(count);
  const timer = window.setInterval(() => {
    if (!measuring()) {
      frames = 0;
      filled = 0;
      if (level !== 0) {
        level = 0;
        onStrain(level);
      }
      return;
    }
    seconds[at] = frames;
    at = (at + 1) % SPAN;
    filled = Math.min(SPAN, filled + 1);
    frames = 0;
    if (filled < SPAN) return;
    let sum = 0;
    for (const value of seconds) sum += value;
    const rate = sum / SPAN;
    const next: Strain = rate < STRUGGLING ? 2 : rate < SLOW ? 1 : 0;
    if (next === level) return;
    level = next;
    onStrain(level);
  }, 1000);
  return () => {
    cancelAnimationFrame(frame);
    window.clearInterval(timer);
  };
}
