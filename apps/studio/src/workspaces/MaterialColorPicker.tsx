import { Slider } from '@bezier/ui';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function hexToHsv(hex: string): Hsv {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: h < 0 ? h + 360 : h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const chroma = v * s;
  const section = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const [r1, g1, b1] =
    section < 1
      ? [chroma, x, 0]
      : section < 2
        ? [x, chroma, 0]
        : section < 3
          ? [0, chroma, x]
          : section < 4
            ? [0, x, chroma]
            : section < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = v - chroma;
  const channel = (number: number) =>
    Math.round((number + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r1)}${channel(g1)}${channel(b1)}`;
}

export function MaterialColorPicker({
  value,
  palette = [],
  onChange,
}: {
  value: string;
  palette?: readonly string[];
  onChange: (value: string) => void;
}) {
  const hsv = useMemo(() => hexToHsv(value), [value]);
  const [dragging, setDragging] = useState(false);
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  useEffect(() => setHexDraft(value.toUpperCase()), [value]);
  const style = {
    '--material-color': value,
    '--material-hue': `hsl(${hsv.h} 100% 50%)`,
    '--material-x': `${hsv.s * 100}%`,
    '--material-y': `${(1 - hsv.v) * 100}%`,
  } as CSSProperties;

  const changeSv = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(
      hsvToHex({
        h: hsv.h,
        s: clamp((event.clientX - rect.left) / rect.width),
        v: 1 - clamp((event.clientY - rect.top) / rect.height),
      }),
    );
  };

  const keySv = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.05 : 0.015;
    const next = { ...hsv };
    if (event.key === 'ArrowLeft') next.s = clamp(next.s - step);
    else if (event.key === 'ArrowRight') next.s = clamp(next.s + step);
    else if (event.key === 'ArrowUp') next.v = clamp(next.v + step);
    else if (event.key === 'ArrowDown') next.v = clamp(next.v - step);
    else return;
    event.preventDefault();
    onChange(hsvToHex(next));
  };

  return (
    <div className="material-colour" data-dragging={dragging ? '' : undefined} style={style}>
      <div className="material-colour__title">
        <span>Tint</span>
        <label>
          <i className="material-colour__sample" />
          <input
            aria-label="Material hex colour"
            maxLength={7}
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              setHexDraft(next);
              if (/^#[0-9A-F]{6}$/.test(next)) onChange(next);
            }}
            onBlur={() => setHexDraft(value.toUpperCase())}
            spellCheck={false}
            value={hexDraft}
          />
        </label>
      </div>
      <div
        aria-label="Material saturation and brightness"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
        className="material-colour__field"
        onKeyDown={keySv}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          changeSv(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) changeSv(event);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDragging(false);
        }}
        role="slider"
        tabIndex={0}
      >
        <span className="material-colour__loupe">
          <i className="material-colour__dot" />
        </span>
      </div>
      <Slider
        bare
        label="Material hue"
        max={360}
        min={0}
        onChange={(h) => onChange(hsvToHex({ ...hsv, h }))}
        track={HUE_TRACK}
        value={Math.round(hsv.h)}
      />
      <fieldset aria-label="Suggested material colours" className="material-colour__palette">
        {palette.map((color) => (
          <button
            aria-label={`Use ${color}`}
            aria-pressed={color.toLowerCase() === value.toLowerCase()}
            className="material-colour__palette-button"
            key={color}
            onClick={() => onChange(color)}
            style={{ '--swatch': color } as CSSProperties}
            type="button"
          >
            <i className="material-colour__check" />
          </button>
        ))}
      </fieldset>
    </div>
  );
}

/** The whole colour wheel, left to right, as the hue slider's track. */
const HUE_TRACK =
  'linear-gradient(90deg, #f00 0%, #ff0 16.7%, #0f0 33.3%, #0ff 50%, #00f 66.7%, #f0f 83.3%, #f00 100%)';
