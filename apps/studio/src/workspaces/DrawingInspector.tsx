/**
 * Sheet settings, in the order a drawing is made: the paper, what is shown, what is written, and
 * who it belongs to.
 */

import { CrossIcon, Slider } from '@bezier/ui';
import { type ReactNode, useRef, useState } from 'react';
import { ResizeHandle } from '../ResizeHandle.js';
import {
  type Characteristic,
  type DetailState,
  readVectorLogo,
  SCALES,
  type SheetOptions,
  scaleLabel,
  symbolPath,
  type ToleranceFrame,
  type VectorLogo,
} from './drawing-sheet.js';
import { PhysicsGroups } from './PhysicsGroups.js';
import type { PhysicsContent } from './physics-sheets.js';

interface Props {
  overview?: ReactNode;
  options: SheetOptions;
  patch: <K extends keyof SheetOptions>(key: K, value: SheetOptions[K]) => void;
  autoScale: boolean;
  onAutoScale: (auto: boolean) => void;
  section: number | null;
  onSection: (fraction: number | null) => void;
  detail: DetailState;
  onDetail: (detail: DetailState) => void;
  dimensionCount: number;
  onUndoDimension: () => void;
  onClearDimensions: () => void;
  frames: ToleranceFrame[];
  onFrames: (frames: ToleranceFrame[]) => void;
  logo: VectorLogo | null;
  onLogo: (logo: VectorLogo | null) => void;
  onError: (message: string) => void;
  /** How wide the inspector is, in pixels; the user can drag it. */
  width: number;
  onWidthChange: (width: number) => void;
  /** A physics drawing: its own groups replace a drawing sheet's views and annotations. */
  physics?: PhysicsContent;
  onPhysics?: (patch: Partial<PhysicsContent>) => void;
}

/** Inspector width limits, and the width a double-click resets to. */
export const INSPECTOR_DEFAULT = 296;
export const INSPECTOR_MIN = 248;
export const INSPECTOR_MAX = 460;

const CHARACTERISTICS: { id: Characteristic; label: string }[] = [
  { id: 'position', label: 'Position' },
  { id: 'flatness', label: 'Flatness' },
  { id: 'perpendicularity', label: 'Perpendicularity' },
  { id: 'parallelism', label: 'Parallelism' },
  { id: 'roundness', label: 'Roundness' },
  { id: 'profile', label: 'Profile' },
];

/** Form tolerances control a feature on its own and take no datum. */
const FORM = new Set<Characteristic>(['flatness', 'roundness']);

/** ISO pen widths for the visible outline. */
const WEIGHTS = [0.25, 0.35, 0.5, 0.7];

export function Group({
  title,
  children,
  open = true,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="dwg-group" open={open}>
      <summary>{title}</summary>
      <div className="dwg-group__body">{children}</div>
    </details>
  );
}

export function Segment<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="dwg-field">
      <span>{label}</span>
      <fieldset aria-label={label} className="dwg-segment">
        {options.map(([id, text]) => (
          <button
            aria-pressed={id === value}
            key={String(id)}
            onClick={() => onChange(id)}
            type="button"
          >
            {text}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="dwg-toggle">
      <span>{label}</span>
      <input
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        role="switch"
        type="checkbox"
      />
    </label>
  );
}

export function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="dwg-text">
      <span>{label}</span>
      <input onChange={(e) => onChange(e.target.value)} value={value} />
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className="dwg-num">
      <span>{label}</span>
      <input
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(min === undefined ? n : Math.max(min, n));
        }}
        step="0.5"
        type="number"
        value={value}
      />
      <small>mm</small>
    </label>
  );
}

export function DrawingInspector(p: Props) {
  const [characteristic, setCharacteristic] = useState<Characteristic>('position');
  const [tolerance, setTolerance] = useState('0.05');
  const [datum, setDatum] = useState('A');
  const logoInput = useRef<HTMLInputElement>(null);
  const { options, patch } = p;
  const needsDatum = !FORM.has(characteristic);

  return (
    <aside aria-label="Sheet" className="dwg-inspector">
      <ResizeHandle
        className="dwg-inspector__resize"
        direction="left"
        label="Resize inspector"
        max={INSPECTOR_MAX}
        min={INSPECTOR_MIN}
        onResize={p.onWidthChange}
        reset={INSPECTOR_DEFAULT}
        width={p.width}
      />
      {/* The overview stays fixed; the content below scrolls and fades out as it nears it. */}
      {p.overview}
      <div
        className="dwg-inspector__scroll"
        onScroll={(event) =>
          event.currentTarget.toggleAttribute('data-scrolled', event.currentTarget.scrollTop > 0)
        }
      >
        <Group title="Sheet">
          <Segment
            label="Size"
            onChange={(v) => patch('format', v)}
            options={[
              ['A4', 'A4'],
              ['A3', 'A3'],
              ['A2', 'A2'],
            ]}
            value={options.format}
          />
          {p.physics === undefined && (
            <>
              <Segment
                label="Projection"
                onChange={(v) => patch('projection', v)}
                options={[
                  ['first', 'First angle'],
                  ['third', 'Third angle'],
                ]}
                value={options.projection}
              />
              <label className="dwg-select">
                <span>Scale</span>
                <select
                  aria-label="Scale"
                  onChange={(e) => {
                    if (e.target.value === 'auto') p.onAutoScale(true);
                    else {
                      p.onAutoScale(false);
                      patch('scale', Number(e.target.value));
                    }
                  }}
                  value={p.autoScale ? 'auto' : String(options.scale)}
                >
                  <option value="auto">Auto ({scaleLabel(options.scale)})</option>
                  {SCALES.map((s) => (
                    <option key={s} value={s}>
                      {scaleLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </Group>

        {p.physics !== undefined && p.onPhysics !== undefined ? (
          <PhysicsGroups content={p.physics} onChange={p.onPhysics} />
        ) : (
          <>
            <Group title="Views">
              <Toggle
                checked={options.hidden}
                label="Hidden lines"
                onChange={(v) => patch('hidden', v)}
              />
              <Segment
                label="Line weight"
                onChange={(v) => patch('weight', v)}
                options={WEIGHTS.map((w) => [w, String(w)] as const)}
                value={options.weight}
              />
              <Toggle
                checked={p.section !== null}
                label="Section A–A"
                onChange={(on) => p.onSection(on ? 0.5 : null)}
              />
              {p.section !== null && (
                <Slider
                  format={(v) => `${Math.round(v * 100)} %`}
                  label="Cut height"
                  max={0.95}
                  min={0.05}
                  onChange={p.onSection}
                  step={0.05}
                  stops={[{ value: 0.5, label: 'Middle' }]}
                  value={p.section}
                />
              )}
              <Toggle
                checked={p.detail.on}
                label="Detail B · 2 : 1"
                onChange={(on) => p.onDetail({ ...p.detail, on })}
              />
              {p.detail.on && (
                <div className="dwg-row3">
                  <Num
                    label="X"
                    onChange={(x) => p.onDetail({ ...p.detail, x })}
                    value={p.detail.x}
                  />
                  <Num
                    label="Y"
                    onChange={(y) => p.onDetail({ ...p.detail, y })}
                    value={p.detail.y}
                  />
                  <Num
                    label="R"
                    min={1}
                    onChange={(radius) => p.onDetail({ ...p.detail, radius })}
                    value={p.detail.radius}
                  />
                </div>
              )}
            </Group>

            <Group title="Annotations">
              <div className="dwg-count">
                <span>
                  {p.dimensionCount === 0
                    ? 'No dimensions yet — press D'
                    : `${p.dimensionCount} dimension${p.dimensionCount === 1 ? '' : 's'}`}
                </span>
                <button disabled={p.dimensionCount === 0} onClick={p.onUndoDimension} type="button">
                  Undo
                </button>
                <button
                  disabled={p.dimensionCount === 0}
                  onClick={p.onClearDimensions}
                  type="button"
                >
                  Clear
                </button>
              </div>
              <div className="dwg-field">
                <span>Geometric tolerance</span>
                <fieldset aria-label="Characteristic" className="dwg-symbols">
                  {CHARACTERISTICS.map((c) => (
                    <button
                      aria-label={c.label}
                      aria-pressed={c.id === characteristic}
                      key={c.id}
                      onClick={() => setCharacteristic(c.id)}
                      title={c.label}
                      type="button"
                    >
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="18"
                        stroke="currentColor"
                        strokeWidth="0.45"
                        viewBox="-3 -3 6 6"
                        width="18"
                      >
                        <path d={symbolPath(c.id, 0, 0)} />
                      </svg>
                    </button>
                  ))}
                </fieldset>
              </div>
              <div className="dwg-frame-input">
                <label>
                  <span>Tolerance</span>
                  <input
                    aria-label="Tolerance"
                    inputMode="decimal"
                    onChange={(e) => setTolerance(e.target.value.replace(/[^\d.]/g, ''))}
                    value={tolerance}
                  />
                </label>
                <label>
                  <span>Datum</span>
                  <input
                    aria-label="Datum"
                    disabled={!needsDatum}
                    maxLength={3}
                    onChange={(e) => setDatum(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                    value={needsDatum ? datum : '—'}
                  />
                </label>
                <button
                  disabled={tolerance === '' || p.frames.length >= 6}
                  onClick={() =>
                    p.onFrames([
                      ...p.frames,
                      {
                        id: crypto.randomUUID(),
                        characteristic,
                        tolerance,
                        datum: needsDatum ? datum : '',
                      },
                    ])
                  }
                  type="button"
                >
                  Add
                </button>
              </div>
              {p.frames.length > 0 && (
                <ul className="dwg-frames">
                  {p.frames.map((f, i) => (
                    <li key={f.id}>
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="14"
                        stroke="currentColor"
                        strokeWidth="0.5"
                        viewBox="-3 -3 6 6"
                        width="14"
                      >
                        <path d={symbolPath(f.characteristic, 0, 0)} />
                      </svg>
                      <span>
                        {f.tolerance}
                        {f.datum && ` | ${f.datum}`}
                      </span>
                      <button
                        aria-label={`Remove ${f.characteristic} ${f.tolerance}`}
                        onClick={() => p.onFrames(p.frames.filter((_, j) => j !== i))}
                        type="button"
                      >
                        <CrossIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Group>
          </>
        )}

        <Group title="Title Block">
          <Text label="Title" onChange={(v) => patch('title', v)} value={options.title} />
          <div className="dwg-row2">
            <Text label="Drawing No." onChange={(v) => patch('number', v)} value={options.number} />
            <Text
              label="Revision"
              onChange={(v) => patch('revision', v)}
              value={options.revision}
            />
          </div>
          <Text label="Drawn by" onChange={(v) => patch('author', v)} value={options.author} />
          <Text label="Company" onChange={(v) => patch('company', v)} value={options.company} />
        </Group>

        <Group open={false} title="Branding">
          <Text
            label="Watermark"
            onChange={(v) => patch('watermark', v)}
            value={options.watermark}
          />
          {options.watermark !== '' && (
            <Slider
              format={(v) => `${Math.round(v * 100)} %`}
              label="Watermark opacity"
              max={0.3}
              min={0.02}
              onChange={(v) => patch('watermarkOpacity', v)}
              step={0.01}
              value={options.watermarkOpacity}
            />
          )}
          <div className="dwg-count">
            <span>{p.logo ? 'Logo in title block' : 'Logo · SVG paths'}</span>
            <button onClick={() => logoInput.current?.click()} type="button">
              {p.logo ? 'Replace…' : 'Import…'}
            </button>
            {p.logo && (
              <button onClick={() => p.onLogo(null)} type="button">
                Remove
              </button>
            )}
          </div>
          <input
            accept=".svg,image/svg+xml"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file)
                void file
                  .text()
                  .then((text) => p.onLogo(readVectorLogo(text)))
                  .catch((err: unknown) =>
                    p.onError(err instanceof Error ? err.message : String(err)),
                  );
            }}
            ref={logoInput}
            type="file"
          />
        </Group>
      </div>
    </aside>
  );
}
