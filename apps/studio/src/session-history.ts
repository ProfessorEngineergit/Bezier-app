/**
 * Undo that survives closing the project. Undo and redo steps are saved beside the document with a
 * fingerprint of it, and restored on reopen only if the fingerprint matches: steps for another
 * state would undo the wrong thing.
 */

import type { CadDocument, Operation } from '@bezier/core';
import { textKey } from '@bezier/kernel';

export interface UndoStep {
  forward: readonly Operation[];
  inverse: readonly Operation[];
}

/** An import can make one step megabytes; the oldest steps are dropped first. */
const BUDGET = 8_000_000;
const MAX_STEPS = 100;

/** Text this long is replaced by its digest (mainly imported files). */
const LONG_TEXT = 64 * 1024;

/**
 * Stable text for a value, with sorted object keys. Long texts are replaced by their `textKey`, the
 * digest the rebuild cache and shape store already compute; hashing the Voron's 241 MB again cost
 * 0.5 to 2.5 s on open.
 */
function canonical(value: unknown): string {
  if (typeof value === 'string' && value.length > LONG_TEXT) {
    return JSON.stringify(`#${textKey(value)}`);
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/** FNV-1a from `hash` over `text`. */
function fnv(hash: number, text: string): number {
  let next = hash;
  for (let i = 0; i < text.length; i += 1) {
    next ^= text.charCodeAt(i);
    next = Math.imul(next, 0x01000193) >>> 0;
  }
  return next;
}

/**
 * Memo of folding one feature into the hash, per feature object and starting hash. Features are
 * immutable, so appending a feature reuses all earlier folds. Hashing the whole document per edit
 * took a second once it held an import.
 */
const folded = new WeakMap<object, Map<number, { hash: number; length: number }>>();

/**
 * FNV-1a over the document's features and meta, excluding save times. Equal to hashing the
 * canonical text of `{ features, meta }` in one go, computed feature by feature.
 */
export function fingerprint(document: CadDocument): string {
  const { modifiedAt: _modified, ...meta } = document.meta;
  let hash = fnv(0x811c9dc5, '{"features":[');
  let length = '{"features":['.length;
  document.features.forEach((feature, index) => {
    if (index > 0) {
      hash = fnv(hash, ',');
      length += 1;
    }
    const byStart = folded.get(feature) ?? new Map<number, { hash: number; length: number }>();
    let step = byStart.get(hash);
    if (step === undefined) {
      const text = canonical(feature);
      step = { hash: fnv(hash, text), length: text.length };
      byStart.set(hash, step);
      folded.set(feature, byStart);
    }
    hash = step.hash;
    length += step.length;
  });
  const tail = `],"meta":${canonical(meta)}}`;
  hash = fnv(hash, tail);
  length += tail.length;
  return `${hash.toString(16)}:${length}`;
}

/** Serialised length of each step, computed once. */
const sizes = new WeakMap<UndoStep, number>();

function sizeOf(step: UndoStep): number {
  const known = sizes.get(step);
  if (known !== undefined) return known;
  const size = JSON.stringify(step).length;
  sizes.set(step, size);
  return size;
}

/** The newest steps that fit the budget. */
function newest(steps: readonly UndoStep[], budget: number): { kept: UndoStep[]; used: number } {
  const kept: UndoStep[] = [];
  let used = 0;
  for (let i = steps.length - 1; i >= 0 && kept.length < MAX_STEPS; i -= 1) {
    const step = steps[i] as UndoStep;
    const size = sizeOf(step);
    if (used + size > budget) break;
    kept.unshift(step);
    used += size;
  }
  return { kept, used };
}

export function writeHistory(
  document: CadDocument,
  undo: readonly UndoStep[],
  redo: readonly UndoStep[],
): string {
  const kept = newest(undo, BUDGET);
  return JSON.stringify({
    fingerprint: fingerprint(document),
    undo: kept.kept,
    redo: newest(redo, BUDGET - kept.used).kept,
  });
}

/** The steps saved for this exact document, or none. */
export function readHistory(
  text: string | null,
  document: CadDocument,
): { undo: UndoStep[]; redo: UndoStep[] } {
  if (text === null) return { undo: [], redo: [] };
  try {
    const parsed = JSON.parse(text) as { fingerprint?: unknown; undo?: unknown; redo?: unknown };
    if (parsed.fingerprint !== fingerprint(document)) return { undo: [], redo: [] };
    const steps = (value: unknown): UndoStep[] =>
      Array.isArray(value)
        ? value.filter(
            (step): step is UndoStep =>
              typeof step === 'object' &&
              step !== null &&
              Array.isArray((step as UndoStep).forward) &&
              Array.isArray((step as UndoStep).inverse),
          )
        : [];
    return { undo: steps(parsed.undo), redo: steps(parsed.redo) };
  } catch {
    return { undo: [], redo: [] };
  }
}

/** Describes a damaged journal as what was left out of the document. */
export function describeProblem(problem: import('@bezier/core').ReplayProblem): string {
  switch (problem.kind) {
    case 'checksum':
      return `Edit ${problem.seq} was damaged, so everything after it was left out.`;
    case 'gap':
      return `Edit ${problem.expected} is missing, so everything from there on was left out.`;
    case 'rejected':
      return `Edit ${problem.seq} could not be replayed (${problem.reason}).`;
  }
}
