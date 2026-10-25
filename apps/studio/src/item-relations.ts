import { type BodySummary, type FeatureRecord, getFeature } from '@bezier/core';

/** Reads dependencies from feature schemas, so new modeling tools are covered automatically. */
export function sketchBodyLabels(
  sketch: string,
  features: readonly FeatureRecord[],
  bodies: readonly BodySummary[],
): string[] {
  const consumers = new Set([sketch]);
  for (const feature of features) {
    if (feature.suppressed) continue;
    const params = getFeature(feature.type)?.params ?? {};
    if (
      Object.entries(params).some(
        ([key, spec]) =>
          spec.kind === 'featureRef' &&
          typeof feature.params[key] === 'string' &&
          consumers.has(String(feature.params[key])),
      )
    )
      consumers.add(feature.id);
  }
  return bodies
    .filter(
      (body) =>
        consumers.has(body.key.split('#')[0] ?? body.key) ||
        body.faces.some((ref) => ref.kind === 'face' && consumers.has(ref.feature)),
    )
    .map((body) => body.label);
}
