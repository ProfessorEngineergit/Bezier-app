/**
 * Unique names for new items in a project. Chosen at creation and written into the step, so a
 * project replayed from its journal keeps its names.
 */

import type { CadDocument } from '@bezier/core';

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A numbered name ("Sketch 1", "Sketch 2"). Counting continues past existing items, including older
 * ones all named "Sketch".
 */
export function countedName(document: CadDocument, base: string): string {
  const pattern = new RegExp(`^${escaped(base)}( \\d+)?$`);
  const taken = new Set(document.features.map((feature) => feature.name));
  let n = document.features.filter((feature) => pattern.test(feature.name)).length + 1;
  while (taken.has(`${base} ${String(n)}`)) n += 1;
  return `${base} ${String(n)}`;
}

/** The name as given if it is free, else with the next number ("bracket", "bracket 2"). */
export function freeName(document: CadDocument, base: string): string {
  const taken = new Set(document.features.map((feature) => feature.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${String(n)}`)) n += 1;
  return `${base} ${String(n)}`;
}
