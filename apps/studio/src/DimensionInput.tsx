import { typedNumber } from '@bezier/ui';
import { useEffect, useRef } from 'react';

export function DimensionInput({
  label,
  length,
  onChange,
}: {
  label: string;
  length: number;
  onChange: (length: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const scrub = useRef<{ x: number; y: number; start: number; moved: boolean } | null>(null);
  const text = String(Number(length.toFixed(2)));
  useEffect(() => {
    if (input.current !== null && document.activeElement !== input.current)
      input.current.value = text;
  }, [text]);
  return (
    <input
      aria-label={label}
      className="sketch-dimension__value"
      defaultValue={text}
      inputMode="decimal"
      ref={input}
      // Number inputs do not expose reliable text selection in WebKit.
      type="text"
      onFocus={(event) => {
        cancelled.current = false;
        event.currentTarget.select();
      }}
      // Prevent the default so the selection is not replaced by a caret. Dragging works as a dial:
      // right or up raises the value, left or down lowers it, at a rate scaled to its size (3 mm
      // moves by tenths, 300 mm by whole units).
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.select();
        const start = typedNumber(event.currentTarget.value) ?? Number.NaN;
        scrub.current = Number.isFinite(start)
          ? { x: event.clientX, y: event.clientY, start, moved: false }
          : null;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const held = scrub.current;
        if (held === null) return;
        const along = event.clientX - held.x - (event.clientY - held.y);
        if (!held.moved && Math.abs(along) < 4) return;
        held.moved = true;
        const perPixel = Math.max(0.1, Math.round(held.start) / 100);
        const next = Math.max(0.1, held.start + along * perPixel);
        event.currentTarget.value = String(Math.round(next * 10) / 10);
      }}
      onPointerUp={(event) => {
        const held = scrub.current;
        scrub.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        // Blurring commits the value, as for a typed one.
        if (held?.moved === true) event.currentTarget.blur();
      }}
      onBlur={(event) => {
        const value = typedNumber(event.currentTarget.value) ?? Number.NaN;
        if (!cancelled.current && Number.isFinite(value) && value > 0 && value !== length)
          onChange(value);
        else event.currentTarget.value = text;
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          // stopPropagation keeps the sketch open; preventDefault keeps the desktop window from
          // leaving full screen. The next Escape leaves the sketch.
          event.preventDefault();
          cancelled.current = true;
          event.currentTarget.value = text;
          event.currentTarget.blur();
        }
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
