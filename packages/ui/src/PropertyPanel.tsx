/**
 * Feature parameter panel, generated from the feature's schema (ADR 0008). Control choice, units
 * and validation live in `param-control.ts`; this file renders. Numeric fields keep the typed text
 * and commit only once it parses, so partial input (`1.`, `-`) is never rejected mid-typing. Fields
 * also accept expressions over document variables (`wall * 2`, see `expressions.ts` in
 * `@bezier/core`), validated while typing, committed on Enter or blur, with the result shown below.
 */

import type { Evaluated, FeatureId, ParamSpec, ParamsSpec, StableRef } from '@bezier/core';
import { formatRef } from '@bezier/core';
import { useEffect, useId, useState } from 'react';
import { CrossIcon } from './icons/Icons.js';
import { type Control, controlsFor, formatNumber, valueFromInput } from './param-control.js';
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

  return (
    <div className="property-panel">
      {controls.map((control) => (
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
      ))}
    </div>
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
        <div className="property-panel__row">
          <input
            checked={control.value}
            id={id}
            onChange={(event) => onChange(control.key, event.target.checked)}
            type="checkbox"
          />
          <label htmlFor={id}>{control.label}</label>
        </div>
      );

    case 'select':
      return (
        <div className="property-panel__row">
          <label htmlFor={id}>{control.label}</label>
          <select
            id={id}
            onChange={(event) => onChange(control.key, event.target.value)}
            value={control.value}
          >
            {control.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );

    case 'feature':
      return (
        <div className="property-panel__row">
          <label htmlFor={id}>{control.label}</label>
          <select
            id={id}
            onChange={(event) => onChange(control.key, event.target.value)}
            value={control.value}
          >
            <option value="">—</option>
            {selectableFeatures.map((feature) => (
              <option key={feature.id} value={feature.id}>
                {feature.name}
              </option>
            ))}
          </select>
        </div>
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

  // Follow external changes to the stored value (undo, rebuild, viewport drag) without
  // overwriting text being typed.
  useEffect(() => {
    setText(expression ?? formatNumber(control.value));
    setValid(true);
  }, [control.value, expression]);

  const plain = (next: string) => valueFromInput(spec, next);
  const isExpression = (next: string) =>
    onExpression !== undefined && next.trim() !== '' && Number.isNaN(Number(next.trim()));

  function edit(next: string): void {
    setText(next);
    if (isExpression(next)) {
      // Validated while typing, committed only when finished: `wall *` is an intermediate state.
      setValid(check === undefined || check(next.replace(/^=/, '')).ok);
      return;
    }
    const parsed = plain(next);
    setValid(parsed !== null);
    if (parsed === null) return;
    // A plain number replaces an existing expression.
    if (expression !== undefined) onExpression?.(control.key, '');
    onChange(control.key, parsed);
  }

  function commit(): void {
    if (!isExpression(text)) return;
    const next = text.replace(/^=/, '').trim();
    if (next === expression) return;
    const result = check?.(next);
    if (result !== undefined && !result.ok) return;
    onExpression?.(control.key, next);
  }

  const result = expression !== undefined ? check?.(expression) : undefined;

  return (
    <div className="property-panel__row">
      <label htmlFor={id}>{control.label}</label>
      <input
        aria-invalid={!valid}
        className="property-panel__number"
        id={id}
        inputMode="decimal"
        onBlur={commit}
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
        type="text"
        value={text}
      />
      {control.unit !== '' && <span className="property-panel__unit">{control.unit}</span>}
      {result !== undefined && (
        <span className="property-panel__value" data-error={result.ok ? undefined : ''}>
          {result.ok ? `= ${formatNumber(result.value)} ${control.unit}`.trim() : result.message}
        </span>
      )}
    </div>
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
