/**
 * Pushes the island away: a two-finger scroll over it, or a drag upward. It follows the gesture and
 * springs back if the gesture stops short. Either scroll direction counts, since which way is up
 * depends on the device and on the system's natural scrolling.
 */
import { type RefObject, useEffect, useRef } from 'react';

/** How far a gesture has to go, in pixels of scroll or pointer travel. */
const SCROLL_AWAY = 70;
const DRAG_AWAY = 34;
/** The island moves less than the gesture, and no further than this. */
const FOLLOW = 0.55;
const MOST = 34;
/** A scroll with no event for this long has ended. */
const SCROLL_ENDS_MS = 160;
/**
 * After the island is away, the rest of that push (trackpad momentum) is swallowed so it does not
 * turn the view underneath. The push is over after a pause this long, as on the performance graph
 * (performance-gesture.ts), or once the pointer moves this far.
 */
const MOMENTUM_ENDS_MS = 280;
/**
 * Sent away, he leaves from where the push took him instead of springing back first. The lift is
 * dropped once he has faded (`--island-shrink` plus the fade in `island.css`), or after a moment
 * if the push only folded him to the line.
 */
const FADED_MS = 340;
const FOLDED_MS = 60;
const POINTER_MOVES = 4;

export function useSwipeAway(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
  onAway: () => void,
): void {
  const latest = useRef(onAway);
  latest.current = onAway;

  useEffect(() => {
    const element = target.current;
    if (element === null || !enabled) return;
    let pull = 0;
    let ended = 0;
    let press: { y: number; id: number } | null = null;
    let swiped = false;
    let pointer = { x: 0, y: 0 };
    let alive = true;

    const show = (travel: number) => {
      element.style.transform =
        travel === 0 ? '' : `translateY(${String(-Math.min(travel * FOLLOW, MOST))}px)`;
      element.dataset.swiping = travel === 0 ? '' : 'on';
    };
    const reset = () => {
      pull = 0;
      press = null;
      show(0);
    };
    const away = () => {
      window.clearTimeout(ended);
      pull = 0;
      press = null;
      element.dataset.swiping = '';
      element.style.transform = `translateY(${String(-MOST)}px)`;
      swallow(pointer);
      latest.current();
      window.setTimeout(() => {
        if (alive) show(0);
      }, FOLDED_MS);
    };

    // On the window: while he follows the push he slides out from under the pointer, and the rest
    // of that push is still his, not the view's.
    const wheel = (event: WheelEvent) => {
      const over = event.target instanceof Node && element.contains(event.target);
      if (!over && pull === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (pull === 0) pointer = { x: event.clientX, y: event.clientY };
      window.clearTimeout(ended);
      pull += Math.abs(event.deltaY);
      if (pull >= SCROLL_AWAY) {
        away();
        return;
      }
      show(pull);
      ended = window.setTimeout(reset, SCROLL_ENDS_MS);
    };
    const down = (event: PointerEvent) => {
      if (event.button === 0) press = { y: event.clientY, id: event.pointerId };
      swiped = false;
    };
    const move = (event: PointerEvent) => {
      // Moving off ends a push that has not sent him away.
      if (pull !== 0 && press === null && moved(pointer, event)) reset();
      if (press === null || event.pointerId !== press.id) return;
      show(Math.max(0, press.y - event.clientY));
    };
    const up = (event: PointerEvent) => {
      if (press === null || event.pointerId !== press.id) return;
      swiped = press.y - event.clientY >= DRAG_AWAY;
      if (swiped) away();
      else reset();
    };
    // The drag ended on what it started on, which would count as a click on it.
    const click = (event: MouseEvent) => {
      if (!swiped) return;
      swiped = false;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('wheel', wheel, { capture: true, passive: false });
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    element.addEventListener('click', click, true);
    return () => {
      window.clearTimeout(ended);
      window.removeEventListener('wheel', wheel, true);
      element.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      element.removeEventListener('click', click, true);
      alive = false;
      if (element.style.transform === '') return;
      window.setTimeout(() => {
        element.style.transform = '';
      }, FADED_MS);
    };
  }, [target, enabled]);
}

/** Swallows wheel events until the current swipe ends or the pointer leaves `from`. */
function swallow(from: { x: number; y: number }): void {
  let last = performance.now();
  const stop = () => {
    window.removeEventListener('wheel', wheel, true);
    window.removeEventListener('pointermove', move, true);
  };
  const wheel = (event: WheelEvent) => {
    const now = performance.now();
    if (now - last > MOMENTUM_ENDS_MS) {
      stop();
      return;
    }
    last = now;
    event.preventDefault();
    event.stopPropagation();
  };
  const move = (event: PointerEvent) => {
    if (moved(from, event)) stop();
  };
  window.addEventListener('wheel', wheel, { capture: true, passive: false });
  window.addEventListener('pointermove', move, true);
}

function moved(from: { x: number; y: number }, event: PointerEvent): boolean {
  return Math.hypot(event.clientX - from.x, event.clientY - from.y) > POINTER_MOVES;
}
