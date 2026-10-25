import { type FeatureRecord, type PlaneBasis, planeToWorld } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { coalescePreview } from './coalesce-preview.js';
import { MoveGizmo } from './MoveGizmo.js';
import type { Point } from './move-gizmo-math.js';
import type { Session, SessionView } from './session.js';
import { facesBuiltOn } from './sketch-dependents.js';
import { translatedSketch } from './sketch-translation.js';
import { matrixOf } from './TransformTool.js';
import type { ViewportHandle } from './Viewport.js';

export function SketchTransform({
  feature,
  basis,
  view,
  handleRef,
  sessionRef,
  run,
  setView,
  onClose,
}: {
  feature: FeatureRecord;
  basis: PlaneBasis;
  view: SessionView | null;
  handleRef: RefObject<ViewportHandle | null>;
  sessionRef: RefObject<Session | null>;
  run: (change: (session: Session) => Promise<SessionView>) => void;
  setView: (view: SessionView) => void;
  onClose: () => void;
}) {
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const copyId = useRef(`sketch-${crypto.randomUUID()}`);
  const inPreview = useRef(false);
  const [initialPivot] = useState(() => {
    const points = (feature.params.sketch as Sketch).primitives.filter((p) => p.kind === 'point');
    const n = Math.max(1, points.length);
    return planeToWorld(
      basis,
      points.reduce((u, p) => u + p.x / n, 0),
      points.reduce((v, p) => v + p.y / n, 0),
    );
  });
  const change = (session: Session, delta: Point) => {
    const current = session.document.features.find((f) => f.id === feature.id) ?? feature;
    const translated = translatedSketch(current.params.sketch as Sketch, basis, delta);
    const params = {
      ...current.params,
      sketch: translated.sketch,
      offset: Number(current.params.offset ?? 0) + translated.offset,
    };
    return copy
      ? {
          op: 'addFeature' as const,
          id: copyId.current,
          type: 'sketch',
          name: `${current.name} copy`,
          index: session.document.features.length,
          params,
        }
      : { op: 'updateParams' as const, id: current.id, params };
  };
  const latest = useRef({ change, setView });
  latest.current = { change, setView };
  // While dragging, the sketch and its dependents move as a preview and the model is rebuilt once
  // on release (`shown-sketches.ts`); rebuilding every step made the body lag the pointer. A copy
  // is still made in the kernel step by step, since the original must stay put.
  const built =
    view?.display === null || view === null
      ? []
      : facesBuiltOn(view.document, feature.id, view.display.faceRefs);
  const pictured = useRef(false);
  const unpicture = () => {
    if (!pictured.current) return;
    pictured.current = false;
    handleRef.current?.showMovedPreview([], null);
    handleRef.current?.moveShownSketch(null, null);
  };
  const [preview] = useState(() =>
    coalescePreview<Point, SessionView | null>(
      async (delta) =>
        sessionRef.current?.previewApply(latest.current.change(sessionRef.current, delta)) ?? null,
      (view) => {
        if (view !== null) latest.current.setView(view);
      },
    ),
  );
  useEffect(
    () => () => {
      if (pictured.current) {
        handleRef.current?.showMovedPreview([], null);
        handleRef.current?.moveShownSketch(null, null);
      }
      preview.cancel();
      if (inPreview.current)
        void sessionRef.current?.cancelPreview().then((view) => latest.current.setView(view));
    },
    [preview, sessionRef, handleRef],
  );
  return (
    <MoveGizmo
      handleRef={handleRef}
      initialPivot={initialPivot}
      copy={copy}
      busy={busy}
      translationOnly
      onCopyChange={setCopy}
      onClose={() => {
        unpicture();
        preview.cancel();
        inPreview.current = false;
        run((session) => session.cancelPreview());
        onClose();
      }}
      onRotate={() => undefined}
      onPreview={(edit) => {
        if (edit.kind !== 'move') return;
        if (!copy) {
          pictured.current = true;
          handleRef.current?.showMovedPreview(built, matrixOf(edit));
          handleRef.current?.moveShownSketch(feature.id, edit.delta);
          return;
        }
        inPreview.current = true;
        preview.request(edit.delta);
      }}
      onCancel={() => {
        unpicture();
        preview.cancel();
        inPreview.current = false;
        run((session) => session.cancelPreview());
      }}
      onCommit={(delta) => {
        preview.cancel();
        inPreview.current = false;
        setBusy(true);
        run(async (session) => {
          try {
            const before = session.document;
            const next = await session.apply(change(session, delta));
            // Keep the preview while the model rebuilds at the release point, so nothing jumps back
            // for a frame. Revert by hand only when the change did not happen.
            if (next.document === before) unpicture();
            else pictured.current = false;
            return next;
          } finally {
            copyId.current = `sketch-${crypto.randomUUID()}`;
            setBusy(false);
          }
        });
      }}
    />
  );
}
