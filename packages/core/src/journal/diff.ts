/**
 * Computes the operations that turn one document into another, for live collaboration. Keeps
 * every change on the journalled path (ADR 0009). Exact for everything an operation can change;
 * `meta` timestamps are ignored.
 */

import type { CadDocument } from '../document.js';
import type { FeatureRecord } from '../features/types.js';
import { apply } from './journal.js';
import type { Operation } from './operations.js';

/** Operations that turn `from` into `to`, applied in order. Empty if they are equal. */
export function diffOperations(from: CadDocument, to: CadDocument): Operation[] {
  const ops: Operation[] = [];
  let doc = from;
  const push = (op: Operation) => {
    const next = apply(doc, op);
    // Operations are built against `doc`, so a refusal is a bug here.
    if (!next.ok) throw new Error(`diff produced an operation that does not apply: ${next.reason}`);
    doc = next.document;
    ops.push(op);
  };

  const wanted = new Map(to.features.map((f) => [f.id, f]));
  // A changed type means a different feature reusing the id.
  for (const feature of from.features) {
    const target = wanted.get(feature.id);
    if (target === undefined || target.type !== feature.type) {
      push({ op: 'removeFeature', id: feature.id });
    }
  }

  to.features.forEach((target, index) => {
    const at = doc.features.findIndex((f) => f.id === target.id);
    if (at === -1) {
      push({
        op: 'addFeature',
        id: target.id,
        type: target.type,
        name: target.name,
        index,
        params: target.params,
        ...(target.expressions !== undefined ? { expressions: target.expressions } : {}),
      });
    } else if (at !== index) {
      push({ op: 'moveFeature', id: target.id, toIndex: index });
    }
    const current = doc.features[index];
    if (current === undefined) return;
    for (const op of featureChanges(current, target)) push(op);
  });

  for (const op of metaChanges(doc, to)) push(op);
  return ops;
}

function featureChanges(current: FeatureRecord, target: FeatureRecord): Operation[] {
  const ops: Operation[] = [];
  if (canonical(current.params) !== canonical(target.params)) {
    ops.push({ op: 'updateParams', id: target.id, params: target.params });
  }
  if (current.name !== target.name)
    ops.push({ op: 'renameFeature', id: target.id, name: target.name });
  if ((current.suppressed === true) !== (target.suppressed === true)) {
    ops.push({ op: 'suppressFeature', id: target.id, suppressed: target.suppressed === true });
  }
  const before = current.expressions ?? {};
  const after = target.expressions ?? {};
  for (const param of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[param] !== after[param]) {
      ops.push({ op: 'setExpression', id: target.id, param, expression: after[param] ?? '' });
    }
  }
  return ops;
}

function metaChanges(doc: CadDocument, to: CadDocument): Operation[] {
  const ops: Operation[] = [];
  const a = doc.meta;
  const b = to.meta;
  if (a.name !== b.name) ops.push({ op: 'renameDocument', name: b.name });
  if (a.displayUnits !== b.displayUnits) ops.push({ op: 'setDisplayUnits', units: b.displayUnits });

  const hidden = new Set(b.hiddenBodies ?? []);
  const wasHidden = new Set(a.hiddenBodies ?? []);
  for (const key of new Set([...hidden, ...wasHidden])) {
    if (hidden.has(key) !== wasHidden.has(key)) {
      ops.push({ op: 'setBodyVisible', key, visible: !hidden.has(key) });
    }
  }
  for (const [key, name] of changed(a.bodyNames, b.bodyNames)) {
    ops.push({ op: 'renameBody', key, name });
  }
  for (const [key, folder] of changed(a.bodyFolders, b.bodyFolders)) {
    ops.push({ op: 'setBodyFolder', key, folder });
  }

  // Variables are ordered; misplaced ones are removed and re-added at their index.
  const want = b.variables ?? [];
  const have = [...(a.variables ?? [])];
  for (const variable of have) {
    if (!want.some((w) => w.name === variable.name)) {
      ops.push({ op: 'setVariable', name: variable.name, expression: '' });
    }
  }
  let list = have.filter((v) => want.some((w) => w.name === v.name));
  want.forEach((variable, index) => {
    const at = list.findIndex((v) => v.name === variable.name);
    if (at === index) {
      if (list[at]?.expression !== variable.expression) {
        ops.push({ op: 'setVariable', name: variable.name, expression: variable.expression });
        list = list.map((v, i) => (i === at ? variable : v));
      }
      return;
    }
    if (at !== -1) {
      ops.push({ op: 'setVariable', name: variable.name, expression: '' });
      list = list.filter((_, i) => i !== at);
    }
    ops.push({ op: 'setVariable', name: variable.name, expression: variable.expression, index });
    list = [...list.slice(0, index), variable, ...list.slice(index)];
  });

  // Saved views are few and small: rewrite the whole list if it differs.
  const views = b.savedViews ?? [];
  if (JSON.stringify(a.savedViews ?? []) !== JSON.stringify(views)) {
    for (const view of a.savedViews ?? [])
      ops.push({ op: 'setSavedView', name: view.name, view: null });
    for (const view of views) ops.push({ op: 'setSavedView', name: view.name, view });
  }
  return ops;
}

/** Keys whose value differs, with the target value ("" for removed keys). */
function changed(
  before: Readonly<Record<string, string>> | undefined,
  after: Readonly<Record<string, string>> | undefined,
): [string, string][] {
  const a = before ?? {};
  const b = after ?? {};
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((key) => a[key] !== b[key])
    .map((key) => [key, b[key] ?? '']);
}

/** Whether two documents hold the same model, ignoring key order and timestamps. */
export function sameDocument(a: CadDocument, b: CadDocument): boolean {
  return canonical(modelOf(a)) === canonical(modelOf(b));
}

function modelOf(document: CadDocument): unknown {
  const { createdAt: _created, modifiedAt: _modified, ...meta } = document.meta;
  return { meta, features: document.features };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
