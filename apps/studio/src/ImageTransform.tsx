/**
 * Move for a reference image, with the usual three-axis gizmo. Motion is projected onto the image
 * plane: in-plane motion changes `x` and `y`, motion along the normal changes `offset`. Nothing is
 * written until release. With Copy on, the original stays and a copy takes the move.
 */

import { type FeatureRecord, planeToWorld } from '@bezier/core';
import { type RefObject, useState } from 'react';
import { freeName } from './feature-names.js';
import { imageBasis } from './image/image-basis.js';
import { type Placement, placementOf } from './image/placement.js';
import { MoveGizmo } from './MoveGizmo.js';
import type { Point } from './move-gizmo-math.js';
import type { Session, SessionView } from './session.js';
import { useMoveSnap } from './use-move-snap.js';
import type { ViewportHandle } from './Viewport.js';

export function ImageTransform({
  feature,
  handleRef,
  run,
  onPatch,
  onClose,
  view,
}: {
  /** The displayed model, for snapping while moving. */
  view: SessionView | null;
  feature: FeatureRecord;
  handleRef: RefObject<ViewportHandle | null>;
  run: (change: (session: Session) => Promise<SessionView>) => void;
  onPatch: (id: string, params: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [copy, setCopy] = useState(false);
  const basis = imageBasis(feature.params);
  const placement = placementOf(feature.params);
  const offset = typeof feature.params.offset === 'number' ? feature.params.offset : 0;
  // The image's bounding box in space, rotated and offset as shown, for snapping to other bodies.
  const box = (() => {
    if (basis === null) return null;
    const hw = placement.width / 2;
    const hh = placement.height / 2;
    const cos = Math.cos(placement.rotation);
    const sin = Math.sin(placement.rotation);
    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const [cx, cy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as const) {
      const at = planeToWorld(
        basis,
        placement.x + cx * cos - cy * sin,
        placement.y + cx * sin + cy * cos,
      );
      const world = [
        at.x + basis.normal.x * offset,
        at.y + basis.normal.y * offset,
        at.z + basis.normal.z * offset,
      ] as const;
      for (let k = 0; k < 3; k++) {
        const value = world[k] as number;
        lo[k] = Math.min(lo[k] as number, value);
        hi[k] = Math.max(hi[k] as number, value);
      }
    }
    return { min: lo, max: hi } as const;
  })();
  const snapTo = useMoveSnap({
    handleRef,
    display: view?.display ?? null,
    bodies: view?.bodies ?? [],
    selected: [],
    movingBox: box,
  });
  if (basis === null) return null;

  /** Projects a world-space move onto the image plane. */
  const onPlane = (delta: Point) => ({
    du: delta.x * basis.xDirection.x + delta.y * basis.xDirection.y + delta.z * basis.xDirection.z,
    dv: delta.x * basis.yDirection.x + delta.y * basis.yDirection.y + delta.z * basis.yDirection.z,
    dn: delta.x * basis.normal.x + delta.y * basis.normal.y + delta.z * basis.normal.z,
  });
  const moved = (delta: Point): { placement: Placement; offset: number } => {
    const { du, dv, dn } = onPlane(delta);
    return {
      placement: { ...placement, x: placement.x + du, y: placement.y + dv },
      offset: offset + dn,
    };
  };
  const show = (to: { placement: Placement; offset: number }) => {
    const lifted = {
      ...basis,
      origin: {
        x: basis.origin.x + basis.normal.x * (to.offset - offset),
        y: basis.origin.y + basis.normal.y * (to.offset - offset),
        z: basis.origin.z + basis.normal.z * (to.offset - offset),
      },
    };
    handleRef.current?.images.preview(feature.id, to.placement, undefined, lifted);
  };

  return (
    <MoveGizmo
      copy={copy}
      handleRef={handleRef}
      initialPivot={planeToWorld(basis, placement.x, placement.y)}
      onCancel={() => show({ placement, offset })}
      onClose={() => {
        show({ placement, offset });
        onClose();
      }}
      onCommit={(delta) => {
        const to = moved(delta);
        if (copy) {
          // The original goes back; the copy takes the move.
          show({ placement, offset });
          run((session) =>
            session.apply({
              op: 'addFeature',
              id: `image-${String(Date.now())}`,
              type: 'reference-image',
              name: freeName(session.document, `${feature.name} copy`),
              index: session.document.features.length,
              params: {
                ...feature.params,
                x: to.placement.x,
                y: to.placement.y,
                offset: to.offset,
              },
            }),
          );
          return;
        }
        onPatch(feature.id, { x: to.placement.x, y: to.placement.y, offset: to.offset });
      }}
      onCopyChange={setCopy}
      onPreview={(edit) => {
        if (edit.kind === 'move') show(moved(edit.delta));
      }}
      onRotate={() => undefined}
      busy={false}
      snapTo={snapTo}
      translationOnly
    />
  );
}
