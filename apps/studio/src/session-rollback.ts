/**
 * Rolling back to an earlier state (audit F-052): steps from the marker on are suppressed, and new
 * steps are inserted at the marker, which advances past them. Session view state only; nothing is
 * written to the document, so the file, Undo and collaborators are unaffected.
 */
import type { CadDocument, Operation } from '@bezier/core';

/** The document as built with the steps from `at` on suppressed. */
export function rolledBack(document: CadDocument, at: number | null): CadDocument {
  if (at === null || at >= document.features.length) return document;
  return {
    ...document,
    features: document.features.map((feature, index) =>
      index < at ? feature : { ...feature, suppressed: true },
    ),
  };
}

/**
 * Redirects an edit made while rolled back: a step appended at the end goes in at the marker.
 * Returns the operation to apply and the marker afterwards.
 */
export function atMarker(
  operation: Operation,
  at: number | null,
): { operation: Operation; at: number | null } {
  if (at === null || operation.op !== 'addFeature') return { operation, at };
  if (operation.index < at) return { operation, at: at + 1 };
  return { operation: { ...operation, index: at }, at: at + 1 };
}
