/**
 * Copy, Cut and Paste of picked sketch elements, from the Edit menu or keys (audit F-048). Paste
 * adds the elements offset by 10 mm each time so the copy is visible; cut elements are restored in
 * place. A focused text field keeps its own clipboard.
 */
import type { Sketch, SketchId } from '@bezier/solver';
import { patternSelection, pointsOf } from '@bezier/ui';
import { useEffect, useRef } from 'react';
import type { SketchState } from './use-sketch.js';

const STEP = 10;

function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useSketchClipboard(sketch: SketchState, active: boolean): void {
  const held = useRef<{
    ids: readonly SketchId[];
    from: Sketch;
    pasted: number;
    cut: boolean;
  } | null>(null);
  const latest = useRef(sketch);
  latest.current = sketch;
  useEffect(() => {
    if (!active) return;
    const copy = (event: ClipboardEvent, cut: boolean) => {
      if (typingIn(document.activeElement)) return;
      const now = latest.current;
      if (now.selected.length === 0) return;
      event.preventDefault();
      held.current = { ids: [...now.selected], from: now.draft, pasted: 0, cut };
      event.clipboardData?.setData('text/plain', `${now.selected.length} sketch elements`);
      if (cut) now.deleteSelected();
    };
    const paste = (event: ClipboardEvent) => {
      if (typingIn(document.activeElement) || held.current === null) return;
      event.preventDefault();
      const now = latest.current;
      const { ids, from, cut } = held.current;
      const step = STEP * (held.current.pasted + (cut ? 0 : 1));
      // Cut elements are no longer drawn: add them back to copy from, then remove them.
      const present = new Set(now.draft.primitives.map((p) => p.id));
      const restored = from.primitives.filter(
        (p) =>
          !present.has(p.id) &&
          (ids.includes(p.id) ||
            from.primitives.some((q) => ids.includes(q.id) && pointsOf(q).includes(p.id))),
      );
      const gone = new Set(restored.map((p) => p.id));
      const base = { ...now.draft, primitives: [...now.draft.primitives, ...restored] };
      const result = patternSelection(base, ids, {
        kind: 'linear',
        count: 2,
        step: { u: step, v: -step },
      });
      const placed = result.ok
        ? {
            ok: true as const,
            sketch: {
              ...result.sketch,
              primitives: result.sketch.primitives.filter((p) => !gone.has(p.id)),
            },
          }
        : result;
      if (now.applyEdit(placed)) held.current.pasted += 1;
    };
    const onCopy = (event: ClipboardEvent) => copy(event, false);
    const onCut = (event: ClipboardEvent) => copy(event, true);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', paste);
    };
  }, [active]);
}
