/**
 * The app's slider, drawn as a row of segments like the loading bar. Behaves like a CAD number
 * field rather than a range input:
 *
 * - The whole control is the handle. Horizontal drag follows the track; dragging up raises and
 *   down lowers the value.
 * - Values snap to the stops; Shift or Option drags at a tenth of the speed without snapping.
 * - Clicking the value, or typing a digit while hovering, opens a text field.
 * - Wheel or trackpad scrolling steps the value.
 * - Standard keys: arrows step, Shift steps ten, Home and End.
 *
 * The math is in `slider-math.ts`.
 */

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { isApple } from './shortcut.js';
import {
  dragged,
  fraction,
  quantise,
  type SliderRange,
  scrollTravel,
  stepped,
  typed,
} from './slider-math.js';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Value format: `42 %`, `35°`. */
  format?: (value: number) => string;
  /** Snap stops, each with an optional name shown while it is the value. */
  stops?: readonly { value: number; label?: string }[];
  /** Names for the two ends (`Sharper` … `Smoother`). */
  ends?: readonly [string, string];
  /** Track background replacing the segments, e.g. a hue gradient. */
  track?: string;
  /** Hides the label row when the name is shown elsewhere. */
  bare?: boolean;
}

/**
 * Whether the system uses natural (inverted) scrolling. WebKit (the Mac app) reports it on the
 * event; otherwise assume on for macOS and off for Windows and Linux.
 */
function naturalScroll(event: WheelEvent): boolean {
  const told = (event as WheelEvent & { webkitDirectionInvertedFromDevice?: boolean })
    .webkitDirectionInvertedFromDevice;
  if (typeof told === 'boolean') return told;
  return isApple();
}

/** Movement after which a press counts as a drag instead of a click on the track. */
const THRESHOLD = 3;

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  stops = [],
  ends,
  track,
  bare = false,
}: SliderProps) {
  const range: SliderRange = { min, max, step };
  const bar = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  /** Initial field text: the value, or the digit typed over the slider. */
  const [seed, setSeed] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const stopValues = stops.map((stop) => stop.value);
  const named = stops.find((stop) => stop.value === value)?.label;
  const lit = fraction(value, range);

  useEffect(() => {
    if (!editing) return;
    field.current?.focus();
    // A typed digit stays and the caret goes after it; a click selects the old value.
    if (seed === null) field.current?.select();
  }, [editing, seed]);

  // A digit typed while hovering starts editing, as in a CAD number field.
  useEffect(() => {
    if (!hovered || editing || bare) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!/^[0-9.,-]$/.test(event.key)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      setSeed(event.key);
      setEditing(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hovered, editing, bare]);

  // Wheel steps the value. Not React's onWheel: that listener is passive and cannot prevent the
  // page from scrolling.
  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    let rest = 0;
    const onWheel = (event: WheelEvent) => {
      const delta = scrollTravel(event.deltaX, event.deltaY, naturalScroll(event));
      if (delta === 0) return;
      event.preventDefault();
      // Trackpads send many small deltas, wheels a few large ones: one step per 24 px either way.
      rest += delta;
      const steps = Math.trunc(rest / 24);
      if (steps === 0) return;
      rest -= steps * 24;
      const now = latest.current;
      const next = stepped(now.value, steps, event.shiftKey, { min, max, step });
      if (next !== now.value) now.onChange(next);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [min, max, step]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || editing) return;
    if ((event.target as HTMLElement).closest('.slider__value') !== null) return;
    const width = bar.current?.getBoundingClientRect().width ?? 0;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = value;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    let moved = false;

    const move = (next: globalThis.PointerEvent) => {
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < THRESHOLD) return;
      if (!moved) setDragging(true);
      moved = true;
      const fine = next.shiftKey || next.altKey;
      const result = dragged(start, dx, dy, width, range, stopValues, fine);
      if (result !== value) onChange(result);
    };
    const up = (last: globalThis.PointerEvent) => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      setDragging(false);
      // A click without a drag sets the value at the click position.
      const box = bar.current?.getBoundingClientRect();
      if (
        !moved &&
        box !== undefined &&
        last.clientY >= box.top - 8 &&
        last.clientY <= box.bottom + 8
      ) {
        const at = Math.min(1, Math.max(0, (last.clientX - box.left) / box.width));
        onChange(quantise(min + at * (max - min), range));
      }
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => number> = {
      ArrowRight: () => stepped(value, 1, event.shiftKey, range),
      ArrowUp: () => stepped(value, 1, event.shiftKey, range),
      ArrowLeft: () => stepped(value, -1, event.shiftKey, range),
      ArrowDown: () => stepped(value, -1, event.shiftKey, range),
      Home: () => min,
      End: () => max,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(next());
  };

  const commit = (text: string) => {
    setEditing(false);
    setSeed(null);
    const next = typed(text, range);
    if (next !== null && next !== value) onChange(next);
  };

  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      aria-valuetext={named ?? format(value)}
      className="slider"
      data-bare={bare ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      ref={root}
      role="slider"
      tabIndex={0}
    >
      {!bare && (
        <div className="slider__head">
          <span className="slider__label">{label}</span>
          {named !== undefined && <span className="slider__stop">{named}</span>}
          {editing ? (
            <input
              aria-label={`${label} value`}
              className="slider__value slider__field"
              defaultValue={seed ?? String(value)}
              inputMode="decimal"
              onBlur={(event) => commit(event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') commit(event.currentTarget.value);
                if (event.key === 'Escape') {
                  setEditing(false);
                  setSeed(null);
                }
              }}
              ref={field}
            />
          ) : (
            <button
              className="slider__value"
              onClick={() => {
                setSeed(null);
                setEditing(true);
              }}
              tabIndex={-1}
              title="Type a value"
              type="button"
            >
              {format(value)}
            </button>
          )}
        </div>
      )}
      <div
        className="slider__bar"
        data-track={track === undefined ? undefined : ''}
        ref={bar}
        style={
          {
            '--slider-lit': `${lit * 100}%`,
            ...(track === undefined ? {} : { '--slider-track': track }),
          } as CSSProperties
        }
      >
        {track === undefined && <span className="slider__lit" />}
        <span className="slider__edge" />
        {stops.map((stop) => {
          const at = fraction(stop.value, range);
          // The 3px dot is centred on its stop, except the two ends sit flush with the bar so the
          // panel does not clip them.
          return (
            <span
              aria-hidden="true"
              className="slider__tick"
              key={stop.value}
              style={{ left: `${at * 100}%`, marginLeft: `${-3 * at}px` }}
            />
          );
        })}
      </div>
      {ends !== undefined && (
        <div aria-hidden="true" className="slider__ends">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}
