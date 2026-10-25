import {
  type CadDocument,
  type FeatureId,
  type FeatureRecord,
  type FeatureStatus,
  getFeature,
  type PlaneBasis,
  parseRef,
  planeBasis,
  type SketchPlane,
  type StableRef,
} from '@bezier/core';
import type { ShownSketch } from '@bezier/renderer';
import type { Sketch } from '@bezier/solver';
import type { SessionView } from './session.js';

export interface VisibleSketch {
  /**
   * The source feature, so the sketch can be reopened and edits write back to it rather than adding
   * a second sketch.
   */
  id: FeatureId;
  plane: SketchPlane;
  /** The flat face it was drawn on, when not on an origin plane. */
  face: StableRef | null;
  sketch: Sketch;
}

/** Reads the validated sketch payload from a generic feature record. */
export function sketchFromFeature(feature: FeatureRecord): VisibleSketch | null {
  if (feature.type !== 'sketch') return null;
  const plane = feature.params.plane;
  const sketch = feature.params.sketch;
  if (
    (plane === 'XY' || plane === 'XZ' || plane === 'YZ') &&
    typeof sketch === 'object' &&
    sketch !== null &&
    'primitives' in sketch &&
    Array.isArray(sketch.primitives) &&
    'constraints' in sketch &&
    Array.isArray(sketch.constraints)
  ) {
    return { id: feature.id, plane, face: faceOf(feature), sketch: sketch as Sketch };
  }
  return null;
}

function faceOf(feature: FeatureRecord): StableRef | null {
  const [first] = Array.isArray(feature.params.face) ? feature.params.face : [];
  if (first === undefined) return null;
  try {
    return typeof first === 'string' ? parseRef(first) : (first as StableRef);
  } catch {
    return null;
  }
}

/**
 * Which regions of a sketch later features use, or 'all'. Read from each feature's schema rather
 * than a list of types (ADR 0008): a feature referencing the sketch uses the regions in its
 * `regions` parameter, or all when it names none or has no such parameter. Only built features
 * count.
 */
export function usedAreas(
  features: readonly FeatureRecord[],
  statuses: ReadonlyMap<FeatureId, FeatureStatus>,
  sketch: FeatureId,
): 'all' | Set<string> {
  const used = new Set<string>();
  for (const feature of features) {
    if (feature.suppressed === true || statuses.get(feature.id)?.state !== 'ok') continue;
    const spec = getFeature(feature.type)?.params;
    if (spec === undefined) continue;
    const entries = Object.entries(spec);
    const consumes = entries.some(
      ([key, entry]) => entry.kind === 'featureRef' && feature.params[key] === sketch,
    );
    if (!consumes) continue;
    const regionsKey = entries.find(([, entry]) => entry.kind === 'regions')?.[0];
    const regions = regionsKey === undefined ? undefined : feature.params[regionsKey];
    if (!Array.isArray(regions) || regions.length === 0) return 'all';
    for (const key of regions) if (typeof key === 'string') used.add(key);
  }
  return used;
}

/**
 * Every sketch still on offer, on its plane. A sketch is shown until all its closed regions are
 * used, as in other CAD tools; an open drawing with no regions stays shown so it can be finished.
 */
export function shownSketches(
  document: CadDocument,
  view: Pick<SessionView, 'statuses' | 'sketches'>,
  except: FeatureId | null,
  selected: FeatureId | null = null,
): readonly ShownSketch[] {
  const shown: ShownSketch[] = [];
  for (const feature of document.features) {
    if (feature.id === except || feature.suppressed === true) continue;
    const source = sketchFromFeature(feature);
    if (source === null || view.statuses.get(feature.id)?.state !== 'ok') continue;
    const solved = view.sketches.get(feature.id);
    const plane: PlaneBasis | null = solved?.basis ?? planeBasis(source.plane);
    if (plane === null) continue;
    const used = usedAreas(document.features, view.statuses, feature.id);
    const areas = solved?.regions.map((region) => region.key) ?? [];
    if (
      feature.id !== selected &&
      (used === 'all' || (areas.length > 0 && areas.every((key) => used.has(key))))
    )
      continue;
    shown.push({
      id: feature.id,
      plane,
      sketch: source.sketch,
      used: feature.id === selected ? new Set() : used === 'all' ? new Set(areas) : used,
    });
  }
  return shown;
}
