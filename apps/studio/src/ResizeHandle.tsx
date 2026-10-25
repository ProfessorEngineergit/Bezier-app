/**
 * The resize handle along a side panel's edge, shared by the library sidebar and the Items panel.
 * The hit area is eight pixels wide with a one-pixel line drawn inside. Keyboard-reachable;
 * double-click (or Home) resets the width.
 */

/// <reference lib="dom" />

import type { PointerEvent as ReactPointerEvent } from 'react';

export interface ResizeHandleProps {
  /** The panel's current width, in pixels. */
  width: number;
  min: number;
  max: number;
  /** The width a double-click or Home resets to. */
  reset: number;
  onResize: (width: number) => void;
  /** The panel's class, so each keeps its own placement. */
  className: string;
  label: string;
  /**
   * Which way the panel grows relative to the handle: `right` for a handle on the right edge (the
   * library sidebar), `left` for one on the left.
   */
  direction?: 'right' | 'left';
}

const STEP = 8;

export function ResizeHandle({
  width,
  min,
  max,
  reset,
  onResize,
  className,
  label,
  direction = 'right',
}: ResizeHandleProps) {
  const sign = direction === 'right' ? 1 : -1;
  const clamp = (value: number) => Math.min(max, Math.max(min, value));

  const beginResize = (event: ReactPointerEvent<HTMLHRElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    // Listen on the window, not the strip: a fast drag leaves the eight-pixel target immediately.
    const move = (pointer: PointerEvent) =>
      onResize(clamp(startWidth + (pointer.clientX - startX) * sign));
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  return (
    <hr
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={Math.round(width)}
      className={className}
      onDoubleClick={() => onResize(reset)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onResize(clamp(width - STEP * sign));
        else if (event.key === 'ArrowRight') onResize(clamp(width + STEP * sign));
        else if (event.key === 'Home') onResize(reset);
        else return;
        event.preventDefault();
      }}
      onPointerDown={beginResize}
      tabIndex={0}
    />
  );
}
