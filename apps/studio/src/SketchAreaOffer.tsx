/**
 * The offer on a clicked sketch area: the extrude gizmo with nothing built yet. The drag that sets
 * the distance creates the feature; Escape leaves the document unchanged. Modifier-clicking more
 * areas of the same sketch adds them to the offer (`use-sketch-mode.ts`).
 */

import type { FeatureId } from '@bezier/core';
import { type RefObject, useRef } from 'react';
import { ExtrudeGizmo, type PullSense } from './ExtrudeGizmo.js';
import type { ExtrudeParams } from './use-geometry.js';
import type { AreaOffer } from './use-sketch-mode.js';
import type { ViewportHandle } from './Viewport.js';

export function SketchAreaOffer({
  offer,
  onChange,
  canCombine,
  handleRef,
  onCommit,
  onPreview,
}: {
  offer: AreaOffer;
  onChange: (next: AreaOffer | null) => void;
  /** Whether there is a body for Add and Cut to act on. */
  canCombine: boolean;
  handleRef: RefObject<ViewportHandle | null>;
  onCommit: (id: FeatureId, sketch: FeatureId, params: ExtrudeParams) => void;
  onPreview: (id: FeatureId, sketch: FeatureId, params: ExtrudeParams) => void;
}) {
  const change = (params: Partial<ExtrudeParams>) => {
    const next = { ...offer.params, ...params };
    onChange({ ...offer, params: next });
    onPreview(offer.id, offer.sketch, next);
  };
  const sense = useRef<PullSense>('add');
  if (offer.onFace) {
    // On a part's face the sign picks the side: outward adds (or makes a new body), inward cuts (by
    // the distance or through), as a face pull does.
    const signedParams = (value: number): ExtrudeParams => ({
      ...offer.params,
      distance: Math.abs(value),
      direction: value < 0 ? 'backward' : 'forward',
      operation: sense.current === 'new' ? 'new' : value < 0 ? 'cut' : 'add',
      extent: value < 0 && sense.current === 'through' ? 'through' : 'distance',
    });
    const shown =
      offer.params.direction === 'backward' ? -offer.params.distance : offer.params.distance;
    return (
      <ExtrudeGizmo
        anchor={offer.anchor}
        normal={offer.normal}
        canCombine
        directionMode="forward"
        distance={shown}
        faceRef={null}
        handleRef={handleRef}
        signed
        showDirection={false}
        onSenseChange={(next) => {
          sense.current = next;
        }}
        onCommit={(value) => {
          onChange(null);
          onCommit(offer.id, offer.sketch, signedParams(value));
        }}
        onDirectionChange={() => {}}
        onOperationChange={() => {}}
        onPreview={(value) => onPreview(offer.id, offer.sketch, signedParams(value))}
        operation={offer.params.operation}
      />
    );
  }
  return (
    <ExtrudeGizmo
      anchor={offer.anchor}
      normal={offer.normal}
      canCombine={canCombine}
      directionMode={offer.params.direction}
      distance={offer.params.distance}
      faceRef={null}
      handleRef={handleRef}
      onCommit={(distance) => {
        onChange(null);
        onCommit(offer.id, offer.sketch, { ...offer.params, distance });
      }}
      onDirectionChange={(direction) => change({ direction })}
      onOperationChange={(operation) => {
        if (operation !== 'through')
          return change({ operation, extent: 'distance', direction: offer.params.direction });
        // Through all, both ways from the sketch, so material on either side of the plane is cut.
        const through: ExtrudeParams = {
          ...offer.params,
          operation: 'cut',
          extent: 'through',
          direction: 'symmetric',
          distance: Math.max(offer.params.distance, 1),
        };
        onChange(null);
        onCommit(offer.id, offer.sketch, through);
      }}
      onPreview={(distance) => onPreview(offer.id, offer.sketch, { ...offer.params, distance })}
      operation={offer.params.extent === 'through' ? 'through' : offer.params.operation}
    />
  );
}
