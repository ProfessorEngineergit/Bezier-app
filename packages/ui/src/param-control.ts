/**
 * Derives a feature's panel controls from its declared parameters (ADR 0008). Plain functions, no
 * React, so it can be tested in Node. Also the single place for unit conversion: the document
 * stores millimetres and radians (`document.ts`, `params.ts`), angles are shown in degrees.
 */

import type { ParamSpec, ParamsSpec, StableRef } from '@bezier/core';
import { parseRef } from '@bezier/core';
import { typedNumber } from './typed-number.js';

const DEGREES_PER_RADIAN = 180 / Math.PI;

/** The control to draw for one parameter. */
export type Control =
  | {
      kind: 'number';
      key: string;
      label: string;
      value: number;
      /** Unit shown after the field; empty for a plain count. */
      unit: string;
      step: number;
      min?: number;
      max?: number;
    }
  | { kind: 'toggle'; key: string; label: string; value: boolean }
  | { kind: 'select'; key: string; label: string; value: string; options: readonly string[] }
  /** Another feature in the document, by id. */
  | { kind: 'feature'; key: string; label: string; value: string }
  /** Geometry picked in the viewport. */
  | {
      kind: 'refs';
      key: string;
      label: string;
      value: readonly StableRef[];
      of: 'face' | 'edge' | 'vertex';
    }
  /** A sketch; edited by drawing, listed so the panel can say so. */
  | { kind: 'sketch'; key: string; label: string }
  /** A value chosen elsewhere (in the viewport), shown read-only. */
  | { kind: 'note'; key: string; label: string; text: string };

/** The controls for one feature, in schema order (not the key order of the loaded params). */
export function controlsFor(spec: ParamsSpec, params: Record<string, unknown>): Control[] {
  const controls: Control[] = [];
  for (const [key, entry] of Object.entries(spec)) {
    // Set at creation and immutable (see `ParamSpec`).
    if (entry.kind === 'choice' && entry.fixed === true) continue;
    // Stored in the document but not user-facing.
    if ((entry.kind === 'boolean' || entry.kind === 'geometryRefs') && entry.hidden === true)
      continue;
    if ((entry.kind === 'length' || entry.kind === 'angle') && !shown(spec, params, entry.when))
      continue;
    controls.push(controlFor(key, entry, params[key]));
  }
  return controls;
}

/** Whether every parameter named in `when` has one of the listed values (its default if unset). */
function shown(
  spec: ParamsSpec,
  params: Record<string, unknown>,
  when: Readonly<Record<string, readonly unknown[]>> | undefined,
): boolean {
  if (when === undefined) return true;
  return Object.entries(when).every(([key, values]) => {
    const other = spec[key];
    const value =
      params[key] ?? (other !== undefined && 'default' in other ? other.default : undefined);
    return values.includes(value);
  });
}

function controlFor(key: string, spec: ParamSpec, raw: unknown): Control {
  switch (spec.kind) {
    case 'length':
      return {
        kind: 'number',
        key,
        label: spec.label,
        value: numberOr(raw, spec.default),
        unit: 'mm',
        step: 0.5,
        ...(spec.min === undefined ? {} : { min: spec.min }),
        ...(spec.max === undefined ? {} : { max: spec.max }),
      };

    case 'angle':
      return {
        kind: 'number',
        key,
        label: spec.label,
        value: numberOr(raw, spec.default) * shownPerStored(spec),
        unit: '°',
        step: 1,
        // Limits are declared in the stored unit.
        ...(spec.min === undefined ? {} : { min: spec.min * shownPerStored(spec) }),
        ...(spec.max === undefined ? {} : { max: spec.max * shownPerStored(spec) }),
      };

    case 'factor':
      return {
        kind: 'number',
        key,
        label: spec.label,
        value: numberOr(raw, spec.default),
        unit: '×',
        step: 0.1,
        ...(spec.min === undefined ? {} : { min: spec.min }),
        ...(spec.max === undefined ? {} : { max: spec.max }),
      };

    case 'text':
      return {
        kind: 'note',
        key,
        label: spec.label,
        text: typeof raw === 'string' && raw.length > 0 ? 'Stored with the project' : 'Empty',
      };

    case 'count':
      return {
        kind: 'number',
        key,
        label: spec.label,
        value: numberOr(raw, spec.default),
        unit: '',
        step: 1,
        ...(spec.min === undefined ? {} : { min: spec.min }),
      };

    case 'boolean':
      return {
        kind: 'toggle',
        key,
        label: spec.label,
        value: typeof raw === 'boolean' ? raw : spec.default,
      };

    case 'choice':
      return {
        kind: 'select',
        key,
        label: spec.label,
        value: typeof raw === 'string' ? raw : spec.default,
        options: spec.options,
      };

    case 'featureRef':
      return {
        kind: 'feature',
        key,
        label: spec.label,
        value: typeof raw === 'string' ? raw : '',
      };

    case 'geometryRefs':
      return {
        kind: 'refs',
        key,
        label: spec.label,
        value: refsFrom(raw),
        of: spec.of,
      };

    case 'sketch':
      return { kind: 'sketch', key, label: spec.label };

    case 'regions': {
      const count = Array.isArray(raw) ? raw.length : 0;
      return {
        kind: 'note',
        key,
        label: spec.label,
        text:
          count === 0
            ? 'Every closed area of the sketch'
            : count === 1
              ? 'One area, picked in the viewport'
              : `${count} areas, picked in the viewport`,
      };
    }
  }
}

/**
 * Converts typed text to a stored value, or null if invalid. Never clamps or corrects: the panel
 * keeps the typed text and does not commit until it is valid. Converts degrees back to radians.
 */
export function valueFromInput(spec: ParamSpec, text: string): number | null {
  if (
    spec.kind !== 'length' &&
    spec.kind !== 'angle' &&
    spec.kind !== 'count' &&
    spec.kind !== 'factor'
  ) {
    return null;
  }

  const trimmed = text.trim();
  if (trimmed === '') return null;

  const parsed = typedNumber(trimmed);
  if (parsed === null) return null;

  if (spec.kind === 'count') {
    return Number.isInteger(parsed) && (spec.min === undefined || parsed >= spec.min)
      ? parsed
      : null;
  }

  if (spec.kind === 'factor' && !(parsed > 0)) return null;
  if (spec.kind === 'angle') {
    const stored = parsed / shownPerStored(spec);
    if (spec.min !== undefined && stored < spec.min) return null;
    if (spec.max !== undefined && stored > spec.max) return null;
    return stored;
  }

  if (spec.min !== undefined && parsed < spec.min) return null;
  if (spec.max !== undefined && parsed > spec.max) return null;
  return parsed;
}

/** Formats a stored number for a field, trimming trailing zeros (`12.500` → `12.5`). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(4)));
}

/** Displayed degrees per stored unit: 1 for parameters already stored in degrees. */
function shownPerStored(spec: { degrees?: true }): number {
  return spec.degrees === true ? 1 : DEGREES_PER_RADIAN;
}

function numberOr(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

/**
 * Normalises picked geometry. Raw feature params hold references as canonical strings, while
 * params read through `readParams` hold objects; both reach this function. Unparseable entries are
 * dropped so one bad reference cannot break the panel.
 */
function refsFrom(raw: unknown): readonly StableRef[] {
  if (!Array.isArray(raw)) return [];

  const refs: StableRef[] = [];
  for (const entry of raw) {
    if (typeof entry === 'object' && entry !== null && 'kind' in entry) {
      refs.push(entry as StableRef);
      continue;
    }
    try {
      refs.push(parseRef(String(entry)));
    } catch {
      // Not a reference; skip it.
    }
  }
  return refs;
}
