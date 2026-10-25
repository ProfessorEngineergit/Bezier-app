/**
 * Apply and invert for the variable and expression operations. Empty collections omit their key,
 * so undo restores the identical document.
 */

import type { CadDocument } from '../document.js';
import { variableNameProblem } from '../expressions.js';
import type { Operation } from './operations.js';

type Result = { ok: true; document: CadDocument } | { ok: false; reason: string };
type SetVariable = Extract<Operation, { op: 'setVariable' }>;
type SetExpression = Extract<Operation, { op: 'setExpression' }>;

export function applyVariable(document: CadDocument, op: SetVariable): Result {
  const problem = variableNameProblem(op.name);
  if (problem !== null) return { ok: false, reason: problem };
  const list = [...(document.meta.variables ?? [])];
  const at = list.findIndex((variable) => variable.name === op.name);
  const expression = op.expression.trim();
  if (expression === '') {
    if (at !== -1) list.splice(at, 1);
  } else if (at !== -1) {
    list[at] = { name: op.name, expression };
  } else {
    const index = Math.max(0, Math.min(op.index ?? list.length, list.length));
    list.splice(index, 0, { name: op.name, expression });
  }
  const { variables: _previous, ...meta } = document.meta;
  return {
    ok: true,
    document: { ...document, meta: list.length === 0 ? meta : { ...meta, variables: list } },
  };
}

export function invertVariable(document: CadDocument, op: SetVariable): Operation {
  const list = document.meta.variables ?? [];
  const index = list.findIndex((variable) => variable.name === op.name);
  const previous = list[index];
  return previous === undefined
    ? { op: 'setVariable', name: op.name, expression: '' }
    : { op: 'setVariable', name: op.name, expression: previous.expression, index };
}

export function applyExpression(document: CadDocument, op: SetExpression): Result {
  let found = false;
  const features = document.features.map((feature) => {
    if (feature.id !== op.id) return feature;
    found = true;
    const { [op.param]: _old, ...others } = feature.expressions ?? {};
    const expression = op.expression.trim();
    const next = expression === '' ? others : { ...others, [op.param]: expression };
    const sorted = Object.fromEntries(
      Object.entries(next).sort(([a], [b]) => a.localeCompare(b, 'en')),
    );
    const { expressions: _previous, ...rest } = feature;
    return Object.keys(sorted).length === 0 ? rest : { ...rest, expressions: sorted };
  });
  return found
    ? { ok: true, document: { ...document, features } }
    : { ok: false, reason: `no feature ${op.id}` };
}

export function invertExpression(document: CadDocument, op: SetExpression): Operation | null {
  const feature = document.features.find((candidate) => candidate.id === op.id);
  if (feature === undefined) return null;
  return {
    op: 'setExpression',
    id: op.id,
    param: op.param,
    expression: feature.expressions?.[op.param] ?? '',
  };
}
