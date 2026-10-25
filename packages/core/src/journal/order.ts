/**
 * History reordering rules (audit F-053). A step may not move above a step it references, nor
 * below one that references it. Other moves are allowed; the rebuild reports any failures.
 */
import type { CadDocument } from '../document.js';
import { getFeature, readParams } from '../features/registry.js';
import type { FeatureId } from '../features/types.js';
import type { StableRef } from '../stable-ref.js';

/** The steps a feature references, from its declared parameters (ADR 0008). */
export function namedSteps(document: CadDocument, id: FeatureId): ReadonlySet<FeatureId> {
  const out = new Set<FeatureId>();
  const record = document.features.find((feature) => feature.id === id);
  const spec = record === undefined ? undefined : getFeature(record.type)?.params;
  const read = record === undefined ? null : readParams(record.type, record.params);
  if (spec === undefined || read === null || !read.ok) return out;
  for (const [key, entry] of Object.entries(spec)) {
    const value = read.params[key];
    if (entry.kind === 'featureRef' && typeof value === 'string' && value !== '') out.add(value);
    if (entry.kind === 'geometryRefs' && Array.isArray(value))
      for (const ref of value as readonly StableRef[])
        for (const face of ref.kind === 'face' ? [ref] : ref.faces) out.add(face.feature);
  }
  out.delete(id);
  return out;
}

/** Why `id` cannot move to `toIndex` (its index after the move), or null if it can. */
export function moveProblem(document: CadDocument, id: FeatureId, toIndex: number): string | null {
  const features = [...document.features];
  const from = features.findIndex((feature) => feature.id === id);
  const moved = features[from];
  if (moved === undefined) return 'That step is no longer in the history.';
  features.splice(from, 1);
  const at = Math.max(0, Math.min(toIndex, features.length));
  features.splice(at, 0, moved);
  const nameOf = (other: FeatureId) =>
    document.features.find((feature) => feature.id === other)?.name ?? other;
  for (const [index, feature] of features.entries()) {
    for (const needed of namedSteps(document, feature.id)) {
      const where = features.findIndex((candidate) => candidate.id === needed);
      if (where > index)
        return `${feature.name} is built on ${nameOf(needed)}, so it has to stay below it.`;
    }
  }
  return null;
}
