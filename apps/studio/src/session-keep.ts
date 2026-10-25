/**
 * Recently closed projects, kept in memory so reopening one skips reading it back (2 to 4 s for the
 * Voron journal).
 *
 * Budgeted by weight, not count, including the open project. When the open and kept projects exceed
 * the budget, the least recently closed goes first. Kernel-side shapes are managed by
 * `RebuildCache` (LRU); this holds the sessions, whose documents dominate page memory.
 */

import type { CadDocument } from '@bezier/core';
import type { Session } from './session.js';

/** Text budget in characters, shared by the open project and the kept ones. */
const BUDGET_CHARACTERS = 500_000_000;
/** Budget for four cores or fewer, or under 8 GB where the browser reports it. */
const SMALL_BUDGET_CHARACTERS = 150_000_000;
/** A feature's weight besides its long texts: parameters and journal entry. */
const FEATURE_CHARACTERS = 2_000;

/** A document's weight in characters: its texts plus a little per feature. */
export function documentWeight(document: CadDocument): number {
  let total = 0;
  const add = (value: unknown): void => {
    if (typeof value === 'string') total += value.length;
    else if (Array.isArray(value)) for (const item of value) add(item);
    else if (typeof value === 'object' && value !== null)
      for (const item of Object.values(value)) add(item);
  };
  for (const feature of document.features) {
    total += FEATURE_CHARACTERS;
    add(feature.params);
  }
  return total;
}

export function keepBudget(): number {
  if (typeof navigator === 'undefined') return BUDGET_CHARACTERS;
  // The desktop app's OS-reported memory (`machine-memory.ts`) is exact.
  const exact = (globalThis as { __bezierMemoryBytes?: number }).__bezierMemoryBytes;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  const small =
    (navigator.hardwareConcurrency ?? 2) <= 4 ||
    (exact !== undefined ? exact < 16 * 2 ** 30 : memory !== undefined && memory < 8);
  return small ? SMALL_BUDGET_CHARACTERS : BUDGET_CHARACTERS;
}

export class SessionKeep {
  /** Least recently closed first. */
  readonly #kept = new Map<string, { session: Session; weight: number }>();
  readonly #budget: number;

  constructor(budget: number = keepBudget()) {
    this.#budget = budget;
  }

  /** Keeps `session` as it was closed. */
  keep(session: Session): void {
    this.#kept.delete(session.id);
    this.#kept.set(session.id, { session, weight: documentWeight(session.document) });
  }

  /** Removes and returns the kept session for `id`, which becomes the open one. */
  take(id: string): Session | null {
    const found = this.#kept.get(id);
    if (found === undefined) return null;
    this.#kept.delete(id);
    return found.session;
  }

  forget(id: string): void {
    this.#kept.delete(id);
  }

  /**
   * Drops kept projects, least recently closed first, until they and `open` (the open project's
   * weight) fit the budget.
   */
  fit(open: number): void {
    let total = open;
    for (const { weight } of this.#kept.values()) total += weight;
    for (const [id, { weight }] of this.#kept) {
      if (total <= this.#budget) return;
      this.#kept.delete(id);
      total -= weight;
    }
  }

  get ids(): string[] {
    return [...this.#kept.keys()];
  }
}
