/**
 * Project selection on the start page. A plain click opens a card; Cmd/Shift-click toggles it;
 * dragging on empty space draws a marquee that selects every touched card (adding with Shift or Cmd
 * at drag start). Dragging a selected card to a folder takes the others along. Escape or a click on
 * nothing clears.
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type Box, boxBetween, marqueeSelection } from './card-marquee.js';

/** Travel before a press on empty space becomes a marquee instead of a click. */
const THRESHOLD = 4;

export interface CardSelection {
  selected: ReadonlySet<string>;
  /** The rectangle being dragged, in viewport pixels, or null. */
  marquee: Box | null;
  toggle: (id: string) => void;
  clear: () => void;
  /** For the card area: starts a marquee on a press on empty space. */
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}

export function useCardSelection(
  area: RefObject<HTMLElement | null>,
  visible: readonly string[],
): CardSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [marquee, setMarquee] = useState<Box | null>(null);
  const current = useRef(selected);
  current.current = selected;

  // Cards no longer shown (filtered, deleted, moved out of the open folder) are deselected, so
  // actions never apply to hidden projects.
  const key = visible.join('|');
  useEffect(() => {
    const shown = new Set(key === '' ? [] : key.split('|'));
    setSelected((all) => {
      const kept = [...all].filter((id) => shown.has(id));
      return kept.length === all.size ? all : new Set(kept);
    });
  }, [key]);

  const clear = useCallback(() => setSelected((all) => (all.size === 0 ? all : new Set())), []);

  const toggle = useCallback((id: string) => {
    setSelected((all) => {
      const next = new Set(all);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || current.current.size === 0) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.pointerType === 'touch') return;
      const target = event.target as HTMLElement;
      const root = area.current;
      if (root === null) return;
      // Elements inside the page that handle their own presses keep them. Only inside: the start
      // page itself is focusable and contains every press.
      const own =
        '.tile, button, input, textarea, a, select, label, [role], [tabindex], [contenteditable]';
      const claimed = target.closest(own);
      if (claimed !== null && root.contains(claimed)) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      const before = current.current;
      // Measured once; cards do not move during the drag.
      const cards = [...root.querySelectorAll<HTMLElement>('[data-doc-id]')].map((element) => {
        const box = element.getBoundingClientRect();
        return {
          id: element.dataset.docId ?? '',
          box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        };
      });
      let drawing = false;
      const move = (next: PointerEvent) => {
        if (!drawing && Math.hypot(next.clientX - startX, next.clientY - startY) < THRESHOLD) {
          return;
        }
        drawing = true;
        const box = boxBetween(startX, startY, next.clientX, next.clientY);
        setMarquee(box);
        setSelected(marqueeSelection(box, cards, before, additive));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        setMarquee(null);
        if (!drawing && !additive) clear();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [area, clear],
  );

  return { selected, marquee, toggle, clear, onPointerDown };
}
