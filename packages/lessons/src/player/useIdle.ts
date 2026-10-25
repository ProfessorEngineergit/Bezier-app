import { type RefObject, useEffect, useState } from 'react';

/** Milliseconds without pointer movement before the controls hide. */
const IDLE_AFTER = 2500;

/**
 * Whether the user has been inactive during playback, so the controls can fade until the next
 * pointer move. Always false while paused.
 */
export function useIdle(area: RefObject<HTMLElement | null>, playing: boolean): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const element = area.current;
    if (element === null || !playing) {
      setIdle(false);
      return;
    }
    let timer = window.setTimeout(() => setIdle(true), IDLE_AFTER);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_AFTER);
    };
    const leave = () => {
      window.clearTimeout(timer);
      setIdle(true);
    };
    element.addEventListener('pointermove', wake);
    element.addEventListener('pointerdown', wake);
    element.addEventListener('pointerleave', leave);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      element.removeEventListener('pointermove', wake);
      element.removeEventListener('pointerdown', wake);
      element.removeEventListener('pointerleave', leave);
      window.removeEventListener('keydown', wake);
    };
  }, [area, playing]);
  return idle;
}
