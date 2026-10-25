/**
 * A number field in a panel: commits on Enter or blur, reverts on Escape, steps with arrow keys.
 * Shows the incoming value except while being edited.
 */

import { useEffect, useRef } from 'react';

export function ImageNumberField({
  label,
  value,
  onCommit,
  unit,
  min,
  max,
  step = 1,
  digits = 2,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const text = String(Number(value.toFixed(digits)));
  useEffect(() => {
    if (input.current !== null && document.activeElement !== input.current)
      input.current.value = text;
  }, [text]);

  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
  return (
    <label className="image-field">
      <span className="image-field__label">{label}</span>
      <span className="image-field__box">
        <input
          aria-label={label}
          className="image-field__input"
          defaultValue={text}
          inputMode="decimal"
          onBlur={(event) => {
            const next = Number(event.currentTarget.value.trim().replace(',', '.'));
            if (
              !cancelled.current &&
              event.currentTarget.value.trim() !== '' &&
              Number.isFinite(next)
            ) {
              const clamped = clamp(next);
              if (Math.abs(clamped - value) > 1e-9) onCommit(clamped);
            }
            event.currentTarget.value = text;
          }}
          onFocus={(event) => {
            cancelled.current = false;
            event.currentTarget.select();
          }}
          onKeyDown={(event) => {
            // Keep page shortcuts (tools, delete) from acting while typing.
            event.stopPropagation();
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') {
              cancelled.current = true;
              event.currentTarget.blur();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const amount = (event.shiftKey ? 10 : 1) * step * (event.key === 'ArrowUp' ? 1 : -1);
              const current = Number(event.currentTarget.value.replace(',', '.'));
              const next = clamp((Number.isFinite(current) ? current : value) + amount);
              event.currentTarget.value = String(Number(next.toFixed(digits)));
              event.currentTarget.select();
            }
          }}
          // Number inputs do not expose reliable text selection in WebKit.
          ref={input}
          type="text"
        />
        {unit !== undefined && <span className="image-field__unit">{unit}</span>}
      </span>
    </label>
  );
}
