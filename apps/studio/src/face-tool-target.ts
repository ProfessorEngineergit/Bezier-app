/**
 * What the face tools act on: the single picked face, unless a transform owns the interaction, plus
 * the fillet or chamfer it belongs to, so that round's editor opens instead of push/pull.
 */

import type { CadDocument, FeatureRecord, StableRef } from '@bezier/core';

export function faceToolTarget(
  moveMode: boolean,
  selectedRefs: readonly StableRef[],
  document: CadDocument | null,
): { extrudeRef: StableRef | null; edgeTreatment: FeatureRecord | undefined } {
  const extrudeRef =
    !moveMode && selectedRefs.length === 1 && selectedRefs[0]?.kind === 'face'
      ? selectedRefs[0]
      : null;
  const edgeTreatment =
    extrudeRef === null
      ? undefined
      : document?.features.find(
          (feature) =>
            feature.id === extrudeRef.feature &&
            (feature.type === 'fillet' || feature.type === 'chamfer'),
        );
  return { extrudeRef, edgeTreatment };
}
