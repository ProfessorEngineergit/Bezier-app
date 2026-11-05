/**
 * A rail's names appear on hover and may land on a panel or bar: those stay hidden while it is
 * there, as they do under an open flyout (`.rail__labels[data-covered]` in shell.css).
 */

import { type RefObject, useEffect } from 'react';

export function useCoveredRailLabels(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const check = () => {
      const panel = ref.current?.getBoundingClientRect();
      if (panel === undefined) return;
      for (const labels of document.querySelectorAll('.rail__group > .rail__labels')) {
        const { left, right, top, bottom } = labels.getBoundingClientRect();
        const covers =
          left < panel.right && panel.left < right && top < panel.bottom && panel.top < bottom;
        labels.toggleAttribute('data-covered', covers);
      }
    };
    check();
    document.addEventListener('pointerover', check);
    return () => {
      document.removeEventListener('pointerover', check);
      for (const labels of document.querySelectorAll('[data-covered]')) {
        labels.removeAttribute('data-covered');
      }
    };
  }, [ref]);
}
