/** A face pull as one reversible feature, across repeated preview/commit cycles. */
import { formatRef, type StableRef } from '@bezier/core';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { CylinderEditor } from './CylinderEditor.js';
import { coalescePreview } from './coalesce-preview.js';
import { ExtrudeGizmo, type PullSense } from './ExtrudeGizmo.js';
import type { Session, SessionView } from './session.js';
import type { PartPreview } from './session-part-edit.js';
import type { ViewportHandle } from './Viewport.js';

/** What a drag step shows: the pulled solid alone, or the model rebuilt. */
type Preview = { part: PartPreview | null } | { view: SessionView } | null;

export interface FaceExtrusionProps {
  face: StableRef;
  point?: { x: number; y: number; z: number } | null;
  handleRef: RefObject<ViewportHandle | null>;
  sessionRef: RefObject<Session | null>;
  run: (change: (session: Session) => Promise<SessionView>) => void;
  setView: (view: SessionView) => void;
  onPulled?: (face: StableRef) => void;
}

/** Classifies the face exactly: tessellated cylinder normals cannot decide which tool to show. */
export function FaceExtrusion(props: FaceExtrusionProps) {
  const [surface, setSurface] = useState<
    import('@bezier/kernel').CylindricalFace | 'plane' | null | undefined
  >(undefined);
  useEffect(() => {
    let active = true;
    const session = props.sessionRef.current;
    if (session)
      void (async () => {
        const cylinder = await session.cylinderOn(props.face);
        const classified = cylinder ?? ((await session.sketchBasisOn(props.face)) ? 'plane' : null);
        if (active) setSurface(classified);
      })();
    return () => {
      active = false;
    };
  }, [props.face, props.sessionRef]);
  if (surface === undefined || surface === null) return null;
  return surface === 'plane' ? (
    <PlanarFaceExtrusion {...props} />
  ) : (
    <CylinderEditor {...props} cylinder={surface} />
  );
}

function PlanarFaceExtrusion({
  face,
  handleRef,
  sessionRef,
  run,
  setView,
  onPulled,
}: FaceExtrusionProps) {
  const [id] = useState(() => `face-extrude-${crypto.randomUUID()}`);
  // Signed distance: pulling the face out along its normal adds, pushing it back through cuts. The
  // gizmo reads the sign from the drag, so there is no separate Add/Cut choice.
  const [distance, setDistance] = useState(0);
  const frame = useRef({
    anchor: handleRef.current?.faceCentroid(face) ?? null,
    normal: handleRef.current?.faceNormal(face) ?? null,
  });
  // What a pull makes beyond add and cut (a new body, a cut through), chosen in the gizmo's menu;
  // the distance's sign still picks the side.
  const sense = useRef<PullSense>('add');
  const change = (session: Session, signed: number) => {
    const params = {
      faces: [formatRef(face)],
      distance: signed,
      merge: true,
      result: sense.current === 'new' ? 'new' : 'join',
      extent: sense.current === 'through' ? 'through' : 'distance',
    };
    return session.document.features.some((f) => f.id === id)
      ? { op: 'updateParams' as const, id, params }
      : {
          op: 'addFeature' as const,
          id,
          type: 'face-extrude',
          name: 'Extrude face',
          index: session.document.features.length,
          params,
        };
  };
  // Read `setView` through a ref: the coalescer is built once and must call the current one.
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  // Coalesce previews so a fast drag does not queue one kernel rebuild per pointer move, which
  // would replay every value for seconds after release (see `coalesce-preview.ts`).
  //
  // A pull at the end of the document previews from its own solid (`session-part-edit.ts`), in
  // milliseconds instead of most of a second on an assembly. An earlier pull rebuilds, since later
  // features may change its result.
  const [preview] = useState(() =>
    coalescePreview<number, Preview>(
      async (signed) => {
        const session = sessionRef.current;
        if (!session) return null;
        const features = session.document.features;
        const at = features.findIndex((f) => f.id === id);
        // The part-only preview supports only add and cut by distance.
        const plain = sense.current === 'add' || sense.current === 'cut';
        if (plain && (at === -1 || at === features.length - 1)) {
          if (signed === 0) return { part: null };
          const replacing = at === -1 ? undefined : id;
          const edit = { kind: 'pull' as const, face, distance: signed };
          return { part: await session.partPreview(edit, replacing) };
        }
        const view =
          signed === 0
            ? await session.rebuild()
            : await session.previewApply(change(session, signed));
        return view === null ? null : { view };
      },
      (shown) => {
        if (shown === null) return;
        if ('view' in shown) {
          // A full rebuild shows the result; clear any part preview left on top of it.
          handleRef.current?.showPartPreview(null);
          setViewRef.current(shown.view);
        } else handleRef.current?.showPartPreview(shown.part, shown.part?.replaces);
      },
    ),
  );
  // Release whatever the drag held when the pull ends.
  useEffect(
    () => () => {
      handleRef.current?.showPartPreview(null);
      void sessionRef.current?.endPartPreview();
    },
    [handleRef, sessionRef],
  );
  if (!frame.current.anchor || !frame.current.normal) return null;
  return (
    <ExtrudeGizmo
      anchor={frame.current.anchor}
      normal={frame.current.normal}
      faceRef={null}
      handleRef={handleRef}
      distance={distance}
      directionMode="forward"
      operation="add"
      signed
      showDirection={false}
      canCombine
      onDirectionChange={() => {}}
      onOperationChange={() => {}}
      onSenseChange={(next) => {
        sense.current = next;
      }}
      onPreview={(value) => preview.request(value)}
      onCommit={(value) => {
        if (value === distance) {
          handleRef.current?.showPartPreview(null);
          return;
        }
        // Escape right after release returns to that value, even while its rebuild is queued.
        setDistance(value);
        run(async (session) => {
          const view = await session.apply(change(session, value));
          if (value > 0 && view.statuses.get(id)?.state === 'ok') onPulled?.(face);
          return view;
        });
      }}
    />
  );
}
