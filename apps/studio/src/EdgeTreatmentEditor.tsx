/** Reopens the feature that created a filleted or chamfered face instead of adding another. */
import { type FeatureRecord, readRef, type StableRef } from '@bezier/core';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { coalescePreview } from './coalesce-preview.js';
import { EdgeGizmo, type EdgeOp } from './EdgeGizmo.js';
import type { Session, SessionView } from './session.js';
import type { PartPreview } from './session-part-edit.js';
import type { ViewportHandle } from './Viewport.js';

export function EdgeTreatmentEditor({
  feature,
  face,
  handleRef,
  sessionRef,
  run,
  setView,
  onRemoved,
}: {
  feature: FeatureRecord;
  face: StableRef;
  handleRef: RefObject<ViewportHandle | null>;
  sessionRef: RefObject<Session | null>;
  run: (change: (session: Session) => Promise<SessionView>) => void;
  setView: (view: SessionView) => void;
  onRemoved: () => void;
}) {
  const [anchor] = useState(() => handleRef.current?.faceCentroid(face) ?? null);
  const [normal] = useState(() => handleRef.current?.faceNormal(face) ?? null);
  const kind: EdgeOp = feature.type === 'fillet' ? 'fillet' : 'chamfer';
  const key = kind === 'fillet' ? 'radius' : 'distance';
  const operation = (size: number) => ({
    op: 'updateParams' as const,
    id: feature.id,
    params: { ...feature.params, [key]: size },
  });
  // Read the latest `operation`/`setView` through refs: every hook below must run before the
  // `anchor`/`normal` early return, so the coalescer is built before this render's
  // `feature.params` are known.
  const operationRef = useRef(operation);
  operationRef.current = operation;
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  // Coalesce previews so a fast drag does not queue one `previewApply` per pointer move; see
  // `coalesce-preview.ts`. The component is keyed by feature id, so one coalescer per lifetime.
  //
  // A fillet or chamfer on one edge at the end of the document previews from its own solid
  // (`session-part-edit.ts`); anything else rebuilds.
  const edgeRef = useRef<StableRef | null>(null);
  const edges = feature.params.edges;
  edgeRef.current = Array.isArray(edges) && edges.length === 1 ? readRef(String(edges[0])) : null;
  const [sizePreview] = useState(() =>
    coalescePreview<number, { part: PartPreview | null } | { view: SessionView | null }>(
      async (size) => {
        const session = sessionRef.current;
        const edge = edgeRef.current;
        if (session === null) return { view: null };
        if (edge !== null && session.document.features.at(-1)?.id === feature.id) {
          return { part: await session.partPreview({ kind, edge, size }, feature.id) };
        }
        return { view: await session.previewApply(operationRef.current(size)) };
      },
      (shown) => {
        if ('part' in shown) handleRef.current?.showPartPreview(shown.part, shown.part?.replaces);
        else if (shown.view) setViewRef.current(shown.view);
      },
    ),
  );
  useEffect(
    () => () => {
      handleRef.current?.showPartPreview(null);
      void sessionRef.current?.endPartPreview();
    },
    [handleRef, sessionRef],
  );
  if (!anchor || !normal) return null;
  return (
    <EdgeGizmo
      anchor={anchor}
      frame={{
        snap: anchor,
        outward: normal,
        tangent:
          Math.abs(normal.z) < 0.9
            ? { x: -normal.y, y: normal.x, z: 0 }
            : { x: 0, y: -normal.z, z: normal.y },
      }}
      initialKind={kind}
      initialSize={Number(feature.params[key])}
      lockKind
      handleRef={handleRef}
      onApply={(_, size) =>
        run(async (session) => {
          if (size === 0) {
            const view = await session.apply({ op: 'removeFeature', id: feature.id });
            onRemoved();
            return view;
          }
          return session.apply(operation(size));
        })
      }
      onPreview={(_, size) => sizePreview.request(size)}
    />
  );
}
