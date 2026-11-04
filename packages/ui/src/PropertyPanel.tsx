/**
 * A tool's numbers, from the feature's schema (ADR 0008): one strip of cells, each with a picture of
 * what it measures, its name, and its value. Pressing the picture and dragging sideways changes the
 * value. What a tool rarely needs (`more`) waits behind More. Control choice, units and validation
 * live in `param-control.ts`; this file renders.
 *
 * Numeric fields keep the typed text and commit a moment after typing stops, so `32` is not built
 * as a 3 on the way there and partial input (`1.`, `-`) is never rejected mid-typing. A value the
 * model refuses goes back to the last good one when the field is left. Fields also accept
 * expressions over document variables (`wall * 2`, see `expressions.ts` in `@bezier/core`),
 * validated while typing, committed on Enter or blur, with the result shown beside them.
 */

import type { Evaluated, FeatureId, ParamSpec, ParamsSpec, StableRef } from '@bezier/core';
import { formatRef } from '@bezier/core';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { BrandIconKey } from './icons/brand-icons.generated.js';
import { BrandIcon, CrossIcon } from './icons/Icons.js';
import {
  type Control,
  controlsFor,
  formatNumber,
  optionLabel,
  valueFromInput,
} from './param-control.js';
import { refLabel } from './ref-label.js';
import { typedNumber } from './typed-number.js';

export interface PropertyPanelProps {
  featureId: FeatureId;
  spec: ParamsSpec;
  params: Readonly<Record<string, unknown>>;
  /** Called with a value in storage units (millimetres, radians). */
  onChange: (key: string, value: unknown) => void;
  /** Puts the viewport into picking mode for this parameter. */
  onPickGeometry?: (key: string) => void;
  /** All referenceable features, for a `featureRef` parameter. */
  selectableFeatures?: readonly { id: FeatureId; name: string }[];
  /** Parameters written as expressions, by key. */
  expressions?: Readonly<Record<string, string>>;
  /** Sets a parameter expression; an empty one reverts to the number. */
  onExpression?: (key: string, expression: string) => void;
  /** Evaluates an expression against document variables, in display units. */
  check?: (expression: string) => Evaluated;
}

/** Cells in the strip; the rest wait behind More. */
const STRIP_CELLS = 4;
const CHOSEN: readonly Control['kind'][] = ['select', 'toggle', 'feature'];
/** How long after the last key a typed number is built. */
const TYPING_MS = 350;
/** How long a change takes to come back before a refused value is put right. */
const SETTLE_MS = 400;
/** How far the pointer moves for one step when dragging a value. */
const SCRUB_PIXELS = 6;

interface ExpressionProps {
  expression: string | undefined;
  onExpression: ((key: string, expression: string) => void) | undefined;
  check: ((expression: string) => Evaluated) | undefined;
}

export function PropertyPanel({
  featureId,
  spec,
  params,
  onChange,
  onPickGeometry,
  selectableFeatures = [],
  expressions,
  onExpression,
  check,
}: PropertyPanelProps) {
  const controls = controlsFor(spec, { ...params });
  const row = (control: Control) => (
    <ControlRow
      control={control}
      // Keyed by feature too, so switching features rebuilds the fields without stale text.
      key={`${featureId}:${control.key}`}
      expression={expressions?.[control.key]}
      onExpression={onExpression}
      check={check}
      onChange={onChange}
      {...(onPickGeometry === undefined ? {} : { onPickGeometry })}
      selectableFeatures={selectableFeatures}
      spec={spec[control.key]}
    />
  );
  // Numbers first: they are what a tool is opened for. The strip holds as many as look calm.
  const numbers: Control[] = controls.filter((control) => control.kind === 'number');
  const choices: Control[] = CHOSEN.flatMap((kind) =>
    controls.filter((control) => control.kind === kind),
  );
  const rest = controls.filter(
    (control) => !numbers.includes(control) && !choices.includes(control),
  );
  const ranked = [...numbers, ...choices].filter((control) => control.more !== true);
  const strip = ranked.slice(0, STRIP_CELLS);
  const later = [...numbers, ...choices].filter((control) => !strip.includes(control));

  return (
    <div className="property-panel">
      {strip.map(row)}
      {rest.map(row)}
      {later.length > 0 && <More>{later.map(row)}</More>}
    </div>
  );
}

/** The tool's rarer settings, in a sheet above the strip. */
function More({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div className="param-more" ref={box}>
      <button
        aria-expanded={open}
        aria-label="More settings"
        className="param-more__button"
        onClick={() => setOpen((was) => !was)}
        title="More settings"
        type="button"
      >
        <BrandIcon name="param-more" />
      </button>
      {open && <div className="param-more__sheet">{children}</div>}
    </div>
  );
}

const ICONS: Readonly<Record<string, BrandIconKey>> = {
  teeth: 'param-teeth',
  module: 'param-module',
  height: 'param-height',
  depth: 'param-height',
  bore: 'param-diameter',
  diameter: 'param-diameter',
  headDiameter: 'param-diameter',
  radius: 'param-radius',
  wall: 'param-wall',
  wire: 'param-wire',
  pitch: 'param-pitch',
  turns: 'param-turns',
  plane: 'param-plane',
  operation: 'param-result',
  size: 'param-size',
  standard: 'param-size',
  kind: 'param-size',
  x: 'param-position',
  y: 'param-position',
  z: 'param-position',
  dx: 'param-position',
};

/** The picture of what a cell sets: by name, or by what kind of number it is. */
function paramIcon(control: Control): BrandIconKey {
  const named = ICONS[control.key];
  if (named !== undefined) return named;
  if (control.kind === 'number' && control.unit === '°') return 'param-angle';
  if (control.kind === 'number' && control.unit === 'mm') return 'param-width';
  return 'param-result';
}

/** A list of choices dressed as a cell; the system's own menu opens from it. */
function ChoiceCell({
  control,
  options,
  onChange,
}: {
  control: Extract<Control, { kind: 'select' | 'feature' }>;
  options: readonly { value: string; label: string }[];
  onChange: (key: string, value: unknown) => void;
}) {
  const shown = options.find((option) => option.value === control.value)?.label ?? '—';
  return (
    <label className="param param--choice">
      <span aria-hidden="true" className="param__icon">
        <BrandIcon name={paramIcon(control)} />
      </span>
      <span className="param__text">
        <span className="param__label">{control.label}</span>
        <span className="param__value">
          {shown}
          <svg aria-hidden="true" className="param__chevron" viewBox="0 0 8 8">
            <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeLinecap="round" />
          </svg>
        </span>
      </span>
      <select
        aria-label={control.label}
        onChange={(event) => onChange(control.key, event.target.value)}
        value={control.value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface RowProps extends ExpressionProps {
  control: Control;
  spec: ParamSpec | undefined;
  onChange: (key: string, value: unknown) => void;
  onPickGeometry?: (key: string) => void;
  selectableFeatures: readonly { id: FeatureId; name: string }[];
}

function ControlRow({
  control,
  spec,
  onChange,
  onPickGeometry,
  selectableFeatures,
  expression,
  onExpression,
  check,
}: RowProps) {
  const id = useId();

  switch (control.kind) {
    case 'number':
      return spec === undefined ? null : (
        <NumberField
          check={check}
          control={control}
          expression={expression}
          id={id}
          onChange={onChange}
          onExpression={onExpression}
          spec={spec}
        />
      );

    case 'toggle':
      return (
        <label className="param param--toggle">
          <span aria-hidden="true" className="param__icon">
            <BrandIcon name={paramIcon(control)} />
          </span>
          <span className="param__text">
            <span className="param__label">{control.label}</span>
            <span className="param__value">{control.value ? 'On' : 'Off'}</span>
          </span>
          <input
            aria-label={control.label}
            checked={control.value}
            id={id}
            onChange={(event) => onChange(control.key, event.target.checked)}
            type="checkbox"
          />
        </label>
      );

    case 'select':
      return (
        <ChoiceCell
          control={control}
          onChange={onChange}
          options={control.options.map((value) => ({ value, label: optionLabel(value) }))}
        />
      );

    case 'feature':
      return (
        <ChoiceCell
          control={control}
          onChange={onChange}
          options={[
            { value: '', label: '—' },
            ...selectableFeatures.map(({ id: value, name: label }) => ({ value, label })),
          ]}
        />
      );

    case 'refs':
      return (
        <ReferenceList
          control={control}
          nameOf={(id) => selectableFeatures.find((feature) => feature.id === id)?.name}
          onChange={onChange}
          {...(onPickGeometry === undefined ? {} : { onPickGeometry })}
        />
      );

    case 'note':
      return (
        <div className="property-panel__row property-panel__row--note">
          <span>{control.label}</span>
          <span className="property-panel__note">{control.text}</span>
        </div>
      );

    case 'sketch':
      // Listed rather than omitted, so the parameter does not disappear from the panel.
      return (
        <div className="property-panel__row property-panel__row--note">
          <span>{control.label}</span>
          <span className="property-panel__note">Edited by drawing in the sketch</span>
        </div>
      );
  }
}

interface NumberFieldProps extends ExpressionProps {
  control: Extract<Control, { kind: 'number' }>;
  spec: ParamSpec;
  id: string;
  onChange: (key: string, value: unknown) => void;
}

function NumberField({
  control,
  spec,
  id,
  onChange,
  expression,
  onExpression,
  check,
}: NumberFieldProps) {
  const [text, setText] = useState(() => expression ?? formatNumber(control.value));
  const [valid, setValid] = useState(true);
  const waiting = useRef(0);
  const scrub = useRef<{ x: number; from: number } | null>(null);

  // Follow external changes to the stored value (undo, rebuild, viewport drag) without
  // overwriting text being typed.
  const stored = useRef<unknown>(null);
  useEffect(() => {
    stored.current = null;
    setText(expression ?? formatNumber(control.value));
    setValid(true);
  }, [control.value, expression]);
  useEffect(() => () => window.clearTimeout(waiting.current), []);

  const plain = (next: string) => valueFromInput(spec, next);
  const isExpression = (next: string) =>
    onExpression !== undefined && next.trim() !== '' && Number.isNaN(Number(next.trim()));

  function store(next: string): void {
    window.clearTimeout(waiting.current);
    const parsed = plain(next);
    if (parsed === null) return;
    // Enter and then leaving the field name one value: a second step would make undo do nothing.
    if (expression === undefined && (parsed === control.value || parsed === stored.current)) return;
    stored.current = parsed;
    // A plain number replaces an existing expression.
    if (expression !== undefined) onExpression?.(control.key, '');
    onChange(control.key, parsed);
  }

  function edit(next: string): void {
    setText(next);
    window.clearTimeout(waiting.current);
    if (isExpression(next)) {
      // Validated while typing, committed only when finished: `wall *` is an intermediate state.
      setValid(check === undefined || check(next.replace(/^=/, '')).ok);
      return;
    }
    setValid(plain(next) !== null);
    waiting.current = window.setTimeout(() => store(next), TYPING_MS);
  }

  function commit(): void {
    if (!isExpression(text)) {
      store(text);
      return;
    }
    const next = text.replace(/^=/, '').trim();
    if (next === expression) return;
    const result = check?.(next);
    if (result !== undefined && !result.ok) return;
    onExpression?.(control.key, next);
  }

  /** Leaving the field: what the model did not take goes back to what it has. */
  function leave(): void {
    commit();
    if (isExpression(text)) return;
    window.setTimeout(() => {
      stored.current = null;
      setText(expression ?? formatNumber(control.value));
      setValid(true);
    }, SETTLE_MS);
  }

  function startScrub(event: ReactPointerEvent<HTMLSpanElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = { x: event.clientX, from: typedNumber(text) ?? control.value };
  }

  function moveScrub(event: ReactPointerEvent<HTMLSpanElement>): void {
    const drag = scrub.current;
    if (drag === null) return;
    const steps = Math.round((event.clientX - drag.x) / SCRUB_PIXELS);
    const next = drag.from + steps * control.step;
    const floor = control.min ?? Number.NEGATIVE_INFINITY;
    setText(formatNumber(Math.min(control.max ?? Number.POSITIVE_INFINITY, Math.max(floor, next))));
  }

  function endScrub(): void {
    if (scrub.current === null) return;
    scrub.current = null;
    store(text);
  }

  const result = expression !== undefined ? check?.(expression) : undefined;

  return (
    <label className="param" data-invalid={valid ? undefined : ''}>
      <span
        aria-hidden="true"
        className="param__icon param__icon--drag"
        onPointerCancel={endScrub}
        onPointerDown={startScrub}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        title="Drag to change"
      >
        <BrandIcon name={paramIcon(control)} />
      </span>
      <span className="param__text">
        <span className="param__label">{control.label}</span>
        <span className="param__value">
          <input
            aria-invalid={!valid}
            aria-label={control.label}
            className="property-panel__number"
            id={id}
            inputMode="decimal"
            onBlur={leave}
            onChange={(event) => edit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                const parsed = typedNumber(text) ?? Number.NaN;
                if (Number.isNaN(parsed)) return;
                event.preventDefault();
                edit(formatNumber(parsed + (event.key === 'ArrowUp' ? 1 : -1) * control.step));
              }
            }}
            // As wide as what is in it, so the unit stands right behind the number.
            style={{ width: `${String(Math.max(1, text.length) + 0.3)}ch` }}
            type="text"
            value={text}
          />
          {control.unit !== '' && <span className="property-panel__unit">{control.unit}</span>}
          {result !== undefined && (
            <span className="property-panel__value" data-error={result.ok ? undefined : ''}>
              {result.ok
                ? `= ${formatNumber(result.value)} ${control.unit}`.trim()
                : result.message}
            </span>
          )}
        </span>
      </span>
    </label>
  );
}

interface ReferenceListProps {
  control: Extract<Control, { kind: 'refs' }>;
  /** A feature's display name, for describing references. */
  nameOf: (feature: string) => string | undefined;
  onChange: (key: string, value: unknown) => void;
  onPickGeometry?: (key: string) => void;
}

/**
 * Describes the attached geometry with the feature's name ("Import · face 6"); the canonical form
 * (`F:import-1:face-6`), used to match dangling references, is the title.
 */
function ReferenceList({ control, nameOf, onChange, onPickGeometry }: ReferenceListProps) {
  function remove(ref: StableRef): void {
    onChange(
      control.key,
      control.value.filter((entry) => formatRef(entry) !== formatRef(ref)),
    );
  }

  return (
    <div className="property-panel__row property-panel__row--refs">
      <span className="property-panel__label">{control.label}</span>

      {control.value.length === 0 ? (
        <span className="property-panel__note">Nothing selected</span>
      ) : (
        <ul>
          {control.value.map((ref) => (
            <li key={formatRef(ref)} title={formatRef(ref)}>
              <span>{refLabel(ref, nameOf)}</span>
              <button
                aria-label={`Remove ${refLabel(ref, nameOf)}`}
                onClick={() => remove(ref)}
                type="button"
              >
                <CrossIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {onPickGeometry !== undefined && (
        <button onClick={() => onPickGeometry(control.key)} type="button">
          Pick {control.of}
        </button>
      )}
    </div>
  );
}
