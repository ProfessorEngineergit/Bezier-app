/**
 * The floating panel for Measure, Section and reference images. It stays inside the stage and clear
 * of the fixed controls (rails, Items button, lower-right menu, open flyouts). Near one of them or
 * an edge it snaps to exactly one gap away (`panel-place.ts`). When something opens where it is, it
 * glides aside and returns once that closes. It may pass under the view cube. Corners resize it.
 */
import { CrossIcon } from '@bezier/ui';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { obstaclesIn } from './floating-place.js';
import { type Box, drawIn, keepClear, resizeFrom } from './panel-place.js';

const LEAST = { width: 220, height: 120 };
const GLIDE_MS = 160;
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;

export function InspectionPanel({
  title,
  label,
  onClose,
  children,
}: {
  title: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  /** Where the user last placed it, in stage pixels; null while at its CSS position. */
  const home = useRef<Box | null>(null);
  const drag = useRef<{ x: number; y: number; start: Box } | null>(null);
  const corner = useRef<{
    x: number;
    y: number;
    start: Box;
    corner: (typeof CORNERS)[number];
  } | null>(null);

  /** The stage size and current obstacles, in stage pixels. */
  const surroundings = useCallback(() => {
    const panel = ref.current;
    const stage = panel?.parentElement;
    if (!panel || !stage) return null;
    const frame = stage.getBoundingClientRect();
    const obstacles = obstaclesIn(stage, panel);
    return { size: { width: frame.width, height: frame.height }, obstacles };
  }, []);

  const current = useCallback((): Box | null => {
    const panel = ref.current;
    if (!panel) return null;
    return {
      left: panel.offsetLeft,
      top: panel.offsetTop,
      width: panel.offsetWidth,
      height: panel.offsetHeight,
    };
  }, []);

  const put = useCallback((box: Box, glide = false, sized = false) => {
    const panel = ref.current;
    if (!panel) return;
    if (glide) {
      panel.dataset.gliding = '';
      window.setTimeout(() => {
        delete panel.dataset.gliding;
      }, GLIDE_MS + 40);
    }
    panel.style.left = `${box.left}px`;
    panel.style.top = `${box.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    if (sized) {
      panel.style.width = `${box.width}px`;
      panel.style.height = `${box.height}px`;
      panel.style.maxHeight = 'none';
    }
  }, []);

  /** Returns it to the user's position, or as close as the stage allows, clear of open panels. */
  const settle = useCallback(() => {
    const around = surroundings();
    const now = current();
    if (around === null || now === null) return;
    // The initial CSS position counts as the user's position.
    home.current ??= now;
    const wanted = home.current;
    const at = keepClear(
      { ...wanted, width: now.width, height: now.height },
      around.size,
      around.obstacles,
    );
    if (Math.abs(at.left - now.left) > 0.5 || Math.abs(at.top - now.top) > 0.5) put(at, true);
  }, [current, put, surroundings]);

  const move = useCallback(
    (left: number, top: number, snap: boolean) => {
      const around = surroundings();
      const now = current();
      if (around === null || now === null) return;
      let box = { ...now, left, top };
      if (snap) box = drawIn(box, around.size, around.obstacles);
      box = keepClear(box, around.size, around.obstacles);
      home.current = box;
      put(box);
    },
    [current, put, surroundings],
  );

  // Re-settle when anything on the stage opens or closes, or the stage or panel resizes. At most
  // once per frame.
  useEffect(() => {
    const panel = ref.current;
    const stage = panel?.parentElement;
    if (!panel || !stage) return;
    let frame = 0;
    const later = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (drag.current === null && corner.current === null) settle();
      });
    };
    const resize = new ResizeObserver(later);
    resize.observe(stage);
    resize.observe(panel);
    const changes = new MutationObserver(later);
    changes.observe(stage, { childList: true, subtree: true });
    later();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
    };
  }, [settle]);

  return (
    <aside aria-label={label} className="inspection-panel" ref={ref}>
      <header className="inspection-panel__header">
        <button
          aria-label={`Move ${title} panel`}
          className="inspection-panel__drag"
          onKeyDown={(event) => {
            const panel = ref.current;
            if (!panel || !event.key.startsWith('Arrow')) return;
            event.preventDefault();
            const step = event.shiftKey ? 40 : 10;
            move(
              panel.offsetLeft +
                (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
              panel.offsetTop +
                (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
              false,
            );
          }}
          onPointerDown={(event) => {
            const start = current();
            if (start === null || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, start };
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (d)
              move(d.start.left + event.clientX - d.x, d.start.top + event.clientY - d.y, true);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          title="Drag to move · arrow keys when focused"
          type="button"
        >
          <span aria-hidden="true">⠿</span>
          {title}
        </button>
        <button
          aria-label={`Exit ${title}`}
          className="inspection-panel__close"
          onClick={onClose}
          type="button"
        >
          <CrossIcon />
        </button>
      </header>
      <div className="inspection-panel__body">{children}</div>
      {CORNERS.map((which) => (
        <span
          aria-hidden="true"
          className="inspection-panel__corner"
          data-corner={which}
          key={which}
          onLostPointerCapture={() => {
            corner.current = null;
          }}
          onPointerDown={(event) => {
            const start = current();
            if (start === null || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            corner.current = { x: event.clientX, y: event.clientY, start, corner: which };
          }}
          onPointerMove={(event) => {
            const c = corner.current;
            const around = surroundings();
            if (!c || around === null) return;
            const box = resizeFrom(
              c.start,
              c.corner,
              event.clientX - c.x,
              event.clientY - c.y,
              around.size,
              LEAST,
            );
            home.current = box;
            put(box, false, true);
          }}
          onPointerUp={() => {
            corner.current = null;
            settle();
          }}
        />
      ))}
    </aside>
  );
}
