/**
 * Feature parameter schemas, used for validating loaded documents, generating the property panel
 * and canonical hashing for the rebuild cache (ADR 0007, ADR 0008).
 */

import { textKey } from '@bezier/kernel';
import type { Sketch } from '@bezier/solver';
import type { StableRef } from '../stable-ref.js';
import { formatRef, parseRef } from '../stable-ref.js';

/**
 * Shows a field only while the named parameters hold one of the listed values (audit F-035).
 * Affects the panel only; the value is kept.
 */
export type ShownWhen = Readonly<Record<string, readonly (string | boolean)[]>>;

/** A single parameter. `kind` decides how it validates, renders, and hashes. */
export type ParamSpec =
  /** A distance in millimetres. Display units are handled by the UI. */
  | {
      kind: 'length';
      label: string;
      default: number;
      min?: number;
      max?: number;
      when?: ShownWhen;
    }
  /**
   * An angle in radians, or degrees with `degrees` (only Revolve's legacy `angleDegrees`, which
   * saved documents store in degrees).
   */
  | {
      kind: 'angle';
      label: string;
      default: number;
      degrees?: true;
      min?: number;
      max?: number;
      when?: ShownWhen;
    }
  /** A unitless multiplier. Positive, or non-negative when `min` is 0. */
  | { kind: 'factor'; label: string; default: number; min?: number; max?: number }
  /** Text stored with the document, such as an imported file. Not shown in the panel. */
  | { kind: 'text'; label: string }
  /** A whole number, for counts and repetitions. */
  | { kind: 'count'; label: string; default: number; min?: number }
  | { kind: 'boolean'; label: string; default: boolean; hidden?: true }
  /**
   * One of a fixed set of strings. `fixed` choices are set at creation and not editable, because
   * changing them would rename the feature's faces.
   */
  | { kind: 'choice'; label: string; options: readonly string[]; default: string; fixed?: true }
  /** Another feature in the document, by id, e.g. the sketch an extrude consumes. */
  | { kind: 'featureRef'; label: string }
  /** A constrained sketch. Only its shape is checked here; the solver validates the rest. */
  | { kind: 'sketch'; label: string }
  /** Sketch region keys (`rebuild/regions.ts`). Empty means all regions. */
  | { kind: 'regions'; label: string; default: readonly string[] }
  /** Picked geometry, always as stable references, never kernel ids (../stable-ref.ts). */
  | {
      kind: 'geometryRefs';
      label: string;
      of: 'face' | 'edge' | 'vertex';
      default?: readonly StableRef[];
      /** Saved but not shown in the panel. */
      hidden?: true;
    };

export type ParamsSpec = Readonly<Record<string, ParamSpec>>;

/** The runtime type a spec entry produces. */
type ValueOf<S extends ParamSpec> = S extends { kind: 'length' | 'angle' | 'count' | 'factor' }
  ? number
  : S extends { kind: 'text' }
    ? string
    : S extends { kind: 'boolean' }
      ? boolean
      : S extends { kind: 'choice'; options: readonly (infer O)[] }
        ? O
        : S extends { kind: 'featureRef' }
          ? string
          : S extends { kind: 'geometryRefs' }
            ? readonly StableRef[]
            : S extends { kind: 'sketch' }
              ? Sketch
              : S extends { kind: 'regions' }
                ? readonly string[]
                : never;

/** The typed parameter object a feature receives, inferred from its schema. */
export type ParamsOf<S extends ParamsSpec> = { readonly [K in keyof S]: ValueOf<S[K]> };

export interface ParamError {
  /** Which parameter. Matches a key in the spec. */
  param: string;
  /** User-facing; shown when a document fails to load. */
  message: string;
}

export type ParamsResult =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; errors: readonly ParamError[] };

/** Validates untrusted parameter values against a schema, collecting all errors. */
export function validateParams(spec: ParamsSpec, raw: unknown): ParamsResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: [{ param: '', message: 'Parameters must be an object.' }] };
  }

  const input = raw as Record<string, unknown>;
  const errors: ParamError[] = [];
  const params: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(spec)) {
    const value = input[key];
    const checked = checkOne(key, entry, value);
    if ('message' in checked) {
      errors.push({ param: key, message: checked.message });
    } else {
      params[key] = checked.value;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, params };
}

function checkOne(
  key: string,
  spec: ParamSpec,
  value: unknown,
): { value: unknown } | { message: string } {
  // Missing values take the default, so new parameters do not invalidate saved documents.
  if (value === undefined) {
    return 'default' in spec ? { value: spec.default } : { message: `${spec.label} is required.` };
  }

  switch (spec.kind) {
    case 'length':
    case 'angle': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { message: `${spec.label} must be a number.` };
      }
      if (spec.kind === 'length' && spec.min !== undefined && value < spec.min) {
        return { message: `${spec.label} must be at least ${spec.min} mm.` };
      }
      if (spec.kind === 'length' && spec.max !== undefined && value > spec.max) {
        return { message: `${spec.label} must be at most ${spec.max} mm.` };
      }
      return { value };
    }

    case 'factor': {
      // Positive, unless `min: 0` allows zero.
      const floor = spec.min === 0 ? 0 : Number.MIN_VALUE;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < floor) {
        return {
          message: `${spec.label} must be a ${spec.min === 0 ? 'positive number or zero' : 'positive number'}.`,
        };
      }
      if (spec.min !== undefined && value < spec.min) {
        return { message: `${spec.label} must be at least ${spec.min}.` };
      }
      if (spec.max !== undefined && value > spec.max) {
        return { message: `${spec.label} must be at most ${spec.max}.` };
      }
      return { value };
    }

    case 'text':
      return typeof value === 'string' ? { value } : { message: `${spec.label} must be text.` };

    case 'count': {
      if (!Number.isInteger(value)) return { message: `${spec.label} must be a whole number.` };
      if (spec.min !== undefined && (value as number) < spec.min) {
        return { message: `${spec.label} must be at least ${spec.min}.` };
      }
      return { value };
    }

    case 'boolean':
      return typeof value === 'boolean'
        ? { value }
        : { message: `${spec.label} must be true or false.` };

    case 'choice':
      return spec.options.includes(value as string)
        ? { value }
        : { message: `${spec.label} must be one of: ${spec.options.join(', ')}.` };

    case 'featureRef':
      return typeof value === 'string' && value.length > 0
        ? { value }
        : { message: `${spec.label} must name a feature.` };

    case 'sketch': {
      const sketch = value as { primitives?: unknown; constraints?: unknown };
      if (!Array.isArray(sketch.primitives) || !Array.isArray(sketch.constraints)) {
        return { message: `${spec.label} is not a readable sketch.` };
      }
      return { value };
    }

    case 'regions':
      return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
        ? { value }
        : { message: `${spec.label} must be a list of sketch areas.` };

    case 'geometryRefs': {
      if (!Array.isArray(value)) return { message: `${spec.label} must be a list.` };
      try {
        // Stored as text; parsing also checks the reference is well formed.
        return { value: value.map((entry) => parseRef(String(entry))) };
      } catch {
        return { message: `${spec.label} contains a reference that could not be read.` };
      }
    }

    default:
      return { message: `Unknown parameter kind for ${key}.` };
  }
}

/**
 * Canonical string for parameter values, used as a rebuild cache key (ADR 0007). Equal values give
 * equal strings and different values never collide. Keys are sorted.
 */
export function canonicalise(spec: ParamsSpec, params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of Object.keys(spec).sort()) {
    parts.push(`${key}=${canonicaliseValue(params[key])}`);
  }
  return parts.join(';');
}

function canonicaliseValue(value: unknown): string {
  if (Array.isArray(value)) {
    // Sorted: selection order does not matter.
    return `[${value.map(canonicaliseValue).sort().join(',')}]`;
  }
  if (isStableRef(value)) return formatRef(value);
  if (typeof value === 'object' && value !== null) {
    // Other objects (mainly sketches) by content; String() would give "[object Object]".
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${canonicaliseValue(record[key])}`)
      .join(',')}}`;
  }
  // The kernel's digest, shared with the store key and undo fingerprint so it is computed once.
  if (typeof value === 'string' && value.length > LONG_TEXT) return `#${textKey(value)}`;
  // Fixed precision, so float noise does not change the key.
  return typeof value === 'number' ? value.toFixed(9) : String(value);
}

/**
 * Text at least this long enters a key as its digest. Copying a large import (241 MB for the
 * Voron assembly) into every key cost about a second per rebuild.
 */
const LONG_TEXT = 64 * 1024;

function isStableRef(value: unknown): value is StableRef {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
  const kind = (value as { kind: unknown }).kind;
  return kind === 'face' || kind === 'edge' || kind === 'vertex';
}
