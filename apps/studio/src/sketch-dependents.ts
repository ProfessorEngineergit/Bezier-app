/**
 * Features built on a sketch: every feature that references it, transitively. A rigid sketch move
 * carries them all, so during the drag they are drawn moved and the model rebuilds once at the end
 * (`SketchTransform.tsx`).
 *
 * References are ids in feature parameters (an extrude's profile sketch, a fillet's faces like
 * `F:extrude-1:top`), matched as whole words so `sketch-1` does not match `sketch-12`.
 */

import type { CadDocument, StableRef } from '@bezier/core';

const ID = /[A-Za-z0-9_-]/;

function names(text: string, id: string): boolean {
  for (let at = text.indexOf(id); at !== -1; at = text.indexOf(id, at + 1)) {
    const before = text[at - 1];
    const after = text[at + id.length];
    if ((before === undefined || !ID.test(before)) && (after === undefined || !ID.test(after)))
      return true;
  }
  return false;
}

/** Ids of the features that depend on `id`, including itself. */
export function dependentsOf(document: CadDocument, id: string): Set<string> {
  const found = new Set([id]);
  for (const feature of document.features) {
    if (found.has(feature.id)) continue;
    const text = JSON.stringify(feature.params);
    for (const each of found)
      if (names(text, each)) {
        found.add(feature.id);
        break;
      }
  }
  return found;
}

/** The displayed faces made by features depending on sketch `id`. */
export function facesBuiltOn(
  document: CadDocument,
  id: string,
  faces: readonly (StableRef | null)[],
): StableRef[] {
  const dependents = dependentsOf(document, id);
  return faces.filter(
    (ref): ref is StableRef => ref !== null && ref.kind === 'face' && dependents.has(ref.feature),
  );
}
