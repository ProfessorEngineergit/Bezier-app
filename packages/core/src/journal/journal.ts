/**
 * The append-only journal: crash safety, cheap writes, undo/redo and replayable history
 * (ADR 0009). Pure and storage-agnostic; persistence lives in @bezier/storage.
 */

import type { CadDocument } from '../document.js';
import type { FeatureRecord } from '../features/types.js';
import type { Operation } from './operations.js';
import { applyExpression, applyVariable, invertExpression, invertVariable } from './variables.js';

export interface JournalEntry {
  /** Strictly increasing from 1. A gap means entries were lost. */
  readonly seq: number;
  /** ISO timestamp. Metadata only; replay must never read it (ADR 0009). */
  readonly at: string;
  readonly op: Operation;
  /** Detects corruption of this entry. See `checksumOf`. */
  readonly checksum: string;
}

/**
 * FNV-1a checksum. Guards against torn writes and corrupted bytes, not attackers; runs on every
 * append.
 */
export function checksumOf(seq: number, op: Operation): string {
  const text = `${seq}:${canonicalJson(op)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** JSON with sorted keys, so equal operations serialise identically regardless of key order. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Builds an entry without writing it; the caller persists, then applies. */
export function createEntry(seq: number, op: Operation, at: string): JournalEntry {
  return { seq, at, op, checksum: checksumOf(seq, op) };
}

export type ReplayProblem =
  | { kind: 'checksum'; seq: number }
  | { kind: 'gap'; expected: number; found: number }
  | { kind: 'rejected'; seq: number; reason: string };

export interface ReplayResult {
  document: CadDocument;
  /** How many entries were applied before stopping. */
  applied: number;
  /** Why replay stopped early, if it did. The good prefix is always kept (ADR 0009). */
  problem?: ReplayProblem;
}

/** Replays entries onto a base snapshot. Deterministic. */
export function replay(base: CadDocument, entries: readonly JournalEntry[]): ReplayResult {
  let document = base;
  let applied = 0;
  let expectedSeq = entries[0]?.seq ?? 1;

  for (const entry of entries) {
    if (entry.seq !== expectedSeq) {
      return {
        document,
        applied,
        problem: { kind: 'gap', expected: expectedSeq, found: entry.seq },
      };
    }
    if (entry.checksum !== checksumOf(entry.seq, entry.op)) {
      return { document, applied, problem: { kind: 'checksum', seq: entry.seq } };
    }

    const next = apply(document, entry.op);
    if (!next.ok) {
      return {
        document,
        applied,
        problem: { kind: 'rejected', seq: entry.seq, reason: next.reason },
      };
    }

    document = next.document;
    applied++;
    expectedSeq++;
  }

  return { document, applied };
}

type ApplyResult = { ok: true; document: CadDocument } | { ok: false; reason: string };

/**
 * Applies one operation, returning a new document. An operation that cannot apply is rejected
 * with a reason instead of throwing.
 */
export function apply(document: CadDocument, op: Operation): ApplyResult {
  switch (op.op) {
    case 'addFeature': {
      if (document.features.some((f) => f.id === op.id)) {
        return { ok: false, reason: `feature ${op.id} already exists` };
      }
      const record: FeatureRecord = {
        id: op.id,
        type: op.type,
        name: op.name,
        params: op.params,
        ...(op.expressions !== undefined && Object.keys(op.expressions).length > 0
          ? { expressions: op.expressions }
          : {}),
      };
      const features = [...document.features];
      // Clamped, not rejected, so an out-of-range index does not block opening the document.
      features.splice(Math.max(0, Math.min(op.index, features.length)), 0, record);
      return { ok: true, document: { ...document, features } };
    }

    case 'updateParams':
      return mapFeature(document, op.id, (f) => ({ ...f, params: op.params }));

    case 'patchParams':
      return mapFeature(document, op.id, (f) => {
        const params: Record<string, unknown> = { ...f.params };
        // null removes a parameter (used by inverses; undefined does not survive JSON).
        for (const [key, value] of Object.entries(op.params)) {
          if (value === null) delete params[key];
          else params[key] = value;
        }
        return { ...f, params };
      });

    case 'renameFeature':
      return mapFeature(document, op.id, (f) => ({ ...f, name: op.name }));

    case 'suppressFeature':
      return mapFeature(document, op.id, (f) => {
        // Omit the key rather than store `false`, so undo restores the identical document and
        // the rebuild cache still hits (ADR 0007).
        if (!op.suppressed) {
          const { suppressed: _removed, ...rest } = f;
          return rest;
        }
        return { ...f, suppressed: true };
      });

    case 'removeFeature': {
      const features = document.features.filter((f) => f.id !== op.id);
      if (features.length === document.features.length) {
        return { ok: false, reason: `no feature ${op.id}` };
      }
      return { ok: true, document: { ...document, features } };
    }

    case 'moveFeature': {
      const from = document.features.findIndex((f) => f.id === op.id);
      if (from === -1) return { ok: false, reason: `no feature ${op.id}` };

      const features = [...document.features];
      const [moved] = features.splice(from, 1);
      if (moved === undefined) return { ok: false, reason: `no feature ${op.id}` };
      features.splice(Math.max(0, Math.min(op.toIndex, features.length)), 0, moved);
      return { ok: true, document: { ...document, features } };
    }

    case 'renameDocument':
      return { ok: true, document: { ...document, meta: { ...document.meta, name: op.name } } };

    case 'setDisplayUnits':
      return {
        ok: true,
        document: { ...document, meta: { ...document.meta, displayUnits: op.units } },
      };

    case 'setSketchPlane':
      return mapFeature(document, op.id, (f) => ({
        ...f,
        params: { ...f.params, plane: op.plane },
      }));

    case 'setBodyVisible': {
      // Sorted and omitted when empty, so showing a body again restores the identical document.
      const others = (document.meta.hiddenBodies ?? []).filter((key) => key !== op.key);
      const hidden = op.visible ? others : [...others, op.key].sort();
      const { hiddenBodies: _previous, ...meta } = document.meta;
      return {
        ok: true,
        document: {
          ...document,
          meta: hidden.length === 0 ? meta : { ...meta, hiddenBodies: hidden },
        },
      };
    }

    case 'renameBody': {
      // Same canonical form as hiding: no names, no key.
      const { [op.key]: _old, ...others } = document.meta.bodyNames ?? {};
      const names = op.name.trim() === '' ? others : { ...others, [op.key]: op.name.trim() };
      const { bodyNames: _previous, ...meta } = document.meta;
      const sorted = Object.fromEntries(
        Object.entries(names).sort(([a], [b]) => a.localeCompare(b, 'en')),
      );
      return {
        ok: true,
        document: {
          ...document,
          meta: Object.keys(sorted).length === 0 ? meta : { ...meta, bodyNames: sorted },
        },
      };
    }

    case 'setBodyFolder': {
      // Same canonical form as names: no folders, no key; keys sorted.
      const { [op.key]: _old, ...others } = document.meta.bodyFolders ?? {};
      const folders = op.folder.trim() === '' ? others : { ...others, [op.key]: op.folder.trim() };
      const { bodyFolders: _previous, ...meta } = document.meta;
      const sorted = Object.fromEntries(
        Object.entries(folders).sort(([a], [b]) => a.localeCompare(b, 'en')),
      );
      return {
        ok: true,
        document: {
          ...document,
          meta: Object.keys(sorted).length === 0 ? meta : { ...meta, bodyFolders: sorted },
        },
      };
    }

    case 'setVariable':
      return applyVariable(document, op);

    case 'setExpression':
      return applyExpression(document, op);

    case 'setSavedView': {
      const name = op.name.trim();
      if (name === '') return { ok: false, reason: 'A saved view needs a name.' };
      // Saving under an existing name replaces that view in place.
      const views = [...(document.meta.savedViews ?? [])];
      const at = views.findIndex((view) => view.name === name);
      if (op.view === null) {
        if (at >= 0) views.splice(at, 1);
      } else if (at >= 0) views[at] = { ...op.view, name };
      else views.push({ ...op.view, name });
      const { savedViews: _previous, ...meta } = document.meta;
      return {
        ok: true,
        document: { ...document, meta: views.length === 0 ? meta : { ...meta, savedViews: views } },
      };
    }
  }
}

function mapFeature(
  document: CadDocument,
  id: string,
  change: (feature: FeatureRecord) => FeatureRecord,
): ApplyResult {
  let found = false;
  const features = document.features.map((feature) => {
    if (feature.id !== id) return feature;
    found = true;
    return change(feature);
  });
  return found
    ? { ok: true, document: { ...document, features } }
    : { ok: false, reason: `no feature ${id}` };
}

/**
 * Returns the operation that reverses `op`, given the document before it. Null means the edit
 * is not undoable.
 */
export function invert(document: CadDocument, op: Operation): Operation | null {
  switch (op.op) {
    case 'addFeature':
      return { op: 'removeFeature', id: op.id };

    case 'removeFeature': {
      const index = document.features.findIndex((f) => f.id === op.id);
      const previous = document.features[index];
      if (previous === undefined) return null;
      return {
        op: 'addFeature',
        id: previous.id,
        type: previous.type,
        name: previous.name,
        index,
        params: previous.params,
        ...(previous.expressions !== undefined ? { expressions: previous.expressions } : {}),
      };
    }

    case 'updateParams': {
      const previous = document.features.find((f) => f.id === op.id);
      return previous === undefined
        ? null
        : { op: 'updateParams', id: op.id, params: previous.params };
    }

    case 'patchParams': {
      const previous = document.features.find((f) => f.id === op.id);
      if (previous === undefined) return null;
      // Only the touched keys, with their previous values.
      const before: Record<string, unknown> = {};
      for (const key of Object.keys(op.params)) before[key] = previous.params[key] ?? null;
      return { op: 'patchParams', id: op.id, params: before };
    }

    case 'renameFeature': {
      const previous = document.features.find((f) => f.id === op.id);
      return previous === undefined
        ? null
        : { op: 'renameFeature', id: op.id, name: previous.name };
    }

    case 'suppressFeature': {
      const previous = document.features.find((f) => f.id === op.id);
      if (previous === undefined) return null;
      return { op: 'suppressFeature', id: op.id, suppressed: previous.suppressed === true };
    }

    case 'moveFeature': {
      const from = document.features.findIndex((f) => f.id === op.id);
      return from === -1 ? null : { op: 'moveFeature', id: op.id, toIndex: from };
    }

    case 'renameDocument':
      return { op: 'renameDocument', name: document.meta.name };

    case 'setDisplayUnits':
      return { op: 'setDisplayUnits', units: document.meta.displayUnits };

    case 'setSketchPlane': {
      const previous = document.features.find((f) => f.id === op.id);
      const plane = previous?.params.plane;
      return typeof plane === 'string'
        ? { op: 'setSketchPlane', id: op.id, plane: plane as 'XY' | 'XZ' | 'YZ' }
        : null;
    }

    case 'setBodyVisible':
      return {
        op: 'setBodyVisible',
        key: op.key,
        visible: !(document.meta.hiddenBodies ?? []).includes(op.key),
      };

    case 'renameBody':
      return { op: 'renameBody', key: op.key, name: document.meta.bodyNames?.[op.key] ?? '' };

    case 'setBodyFolder':
      return {
        op: 'setBodyFolder',
        key: op.key,
        folder: document.meta.bodyFolders?.[op.key] ?? '',
      };

    case 'setVariable':
      return invertVariable(document, op);

    case 'setExpression':
      return invertExpression(document, op);

    case 'setSavedView': {
      // A restored view goes to the end of the list.
      const before = document.meta.savedViews?.find((view) => view.name === op.name.trim());
      return { op: 'setSavedView', name: op.name, view: before ?? null };
    }
  }
}
