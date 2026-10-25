import { type RefObject, useLayoutEffect, useRef } from 'react';

/** Whether to reduce motion: the app setting, else the system's. */
export function reducedMotion(): boolean {
  const setting = document.documentElement.dataset.motion;
  if (setting === 'reduced') return true;
  if (setting === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates children to their new positions when `key` changes (FLIP: first, last, invert, play), so
 * layout stays with the browser. Measured with `offsetLeft`/`offsetTop`, which ignore scrolling.
 */
export function useFlip(container: RefObject<HTMLElement | null>, selector: string, key: string) {
  const places = useRef(new Map<string, { x: number; y: number }>());
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is what says the list changed
  useLayoutEffect(() => {
    const element = container.current;
    if (element === null) return;
    const next = new Map<string, { x: number; y: number }>();
    for (const node of element.querySelectorAll<HTMLElement>(selector)) {
      const id = node.dataset.docId;
      if (id === undefined) continue;
      const at = { x: node.offsetLeft, y: node.offsetTop };
      next.set(id, at);
      const before = places.current.get(id);
      if (before === undefined || reducedMotion()) continue;
      const dx = before.x - at.x;
      const dy = before.y - at.y;
      if (dx === 0 && dy === 0) continue;
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 300,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
    places.current = next;
  }, [key, container, selector]);
}
