/**
 * What opens on a pick: the extrude offer on a clicked sketch area, the editor of a finished round,
 * or the pull of a face. One at a time; a clicked sketch area outranks the face it was drawn on.
 */

import { type FeatureRecord, formatRef, type StableRef } from '@bezier/core';
import type { RefObject } from 'react';
import { EdgeTreatmentEditor } from './EdgeTreatmentEditor.js';
import { FaceExtrusion, type FaceExtrusionProps } from './FaceExtrusion.js';
import { SketchAreaOffer } from './SketchAreaOffer.js';
import type { Session, SessionView } from './session.js';
import type { Run } from './use-run.js';
import type { AreaOffer } from './use-sketch-mode.js';
import type { ViewportHandle } from './Viewport.js';

type OfferProps = Parameters<typeof SketchAreaOffer>[0];

export function PickEditors({
  mode,
  canCombine,
  extrudeRef,
  edgeTreatment,
  point,
  onExtrudeSketch,
  onPreviewSketch,
  onRemoved,
  onPulled,
  handleRef,
  sessionRef,
  run,
  setView,
  say,
}: {
  mode: { offer: AreaOffer | null; setOffer: (next: AreaOffer | null) => void };
  canCombine: boolean;
  extrudeRef: StableRef | null;
  edgeTreatment: FeatureRecord | undefined;
  point: { x: number; y: number; z: number } | null;
  onExtrudeSketch: OfferProps['onCommit'];
  onPreviewSketch: OfferProps['onPreview'];
  onRemoved: () => void;
  onPulled: NonNullable<FaceExtrusionProps['onPulled']>;
  handleRef: RefObject<ViewportHandle | null>;
  sessionRef: RefObject<Session | null>;
  run: Run;
  setView: (view: SessionView) => void;
  say: (message: string) => void;
}) {
  return (
    <>
      {/* Nothing is built until a drag sets a distance; Escape leaves the document unchanged. */}
      {mode.offer !== null && (
        <SketchAreaOffer
          offer={mode.offer}
          onChange={mode.setOffer}
          canCombine={canCombine}
          handleRef={handleRef}
          onCommit={onExtrudeSketch}
          onPreview={onPreviewSketch}
        />
      )}
      {extrudeRef !== null && edgeTreatment !== undefined && (
        <EdgeTreatmentEditor
          key={edgeTreatment.id}
          feature={edgeTreatment}
          onRemoved={onRemoved}
          face={extrudeRef}
          handleRef={handleRef}
          sessionRef={sessionRef}
          run={run}
          setView={setView}
          say={say}
        />
      )}
      {extrudeRef !== null && edgeTreatment === undefined && mode.offer === null && (
        <FaceExtrusion
          key={formatRef(extrudeRef)}
          face={extrudeRef}
          point={point}
          handleRef={handleRef}
          sessionRef={sessionRef}
          run={run}
          setView={setView}
          onPulled={onPulled}
        />
      )}
    </>
  );
}
