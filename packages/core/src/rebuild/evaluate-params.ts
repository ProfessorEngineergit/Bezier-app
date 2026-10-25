/**
 * Replaces expression parameters with their values before validation, so features and the cache
 * see plain numbers and the usual range checks apply.
 */

import type { Evaluated } from '../expressions.js';
import { evaluate } from '../expressions.js';
import type { ParamsSpec } from '../features/params.js';
import type { FeatureRecord } from '../features/types.js';

export type EvaluatedParams =
  | { ok: true; params: Readonly<Record<string, unknown>> }
  | { ok: false; message: string };

export function evaluateParams(
  spec: ParamsSpec,
  record: FeatureRecord,
  lookup: (name: string) => Evaluated,
): EvaluatedParams {
  const expressions = record.expressions;
  if (expressions === undefined) return { ok: true, params: record.params };
  const params: Record<string, unknown> = { ...record.params };
  for (const [key, text] of Object.entries(expressions)) {
    const entry = spec[key];
    if (entry === undefined) continue;
    const label = entry.label;
    if (
      entry.kind !== 'length' &&
      entry.kind !== 'angle' &&
      entry.kind !== 'count' &&
      entry.kind !== 'factor'
    ) {
      return { ok: false, message: `${label} cannot be written as an expression.` };
    }
    const result = evaluate(text, lookup);
    if (!result.ok) return { ok: false, message: `${label} = ${text}: ${result.message}` };
    // Expressions use degrees; angle parameters store radians unless flagged `degrees`.
    params[key] =
      entry.kind === 'angle' && entry.degrees !== true
        ? (result.value * Math.PI) / 180
        : entry.kind === 'count'
          ? Math.round(result.value)
          : result.value;
  }
  return { ok: true, params };
}
