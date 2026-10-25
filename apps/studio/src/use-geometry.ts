import {
  type FaceRef,
  type FeatureId,
  formatRef,
  type Operation,
  type SketchPlane,
  type StableRef,
} from '@bezier/core';
import { rectangleSketch } from '@bezier/ui';
import { type MutableRefObject, useCallback, useRef, useState } from 'react';
import { coalescePreview } from './coalesce-preview.js';
import type { EdgeOp } from './EdgeGizmo.js';
import { countedName } from './feature-names.js';
import type { Session, SessionView } from './session.js';
import type { PartEdit, PartPreview } from './session-part-edit.js';

type Run = (change: (session: Session) => Promise<SessionView>) => void;

/** Extrude parameters other than the profile. */
export interface ExtrudeParams {
  distance: number;
  direction: 'forward' | 'backward' | 'symmetric';
  operation: 'new' | 'add' | 'cut';
  /** By distance, or through everything. Absent: by distance. */
  extent?: 'distance' | 'through';
  /** Closed regions of the sketch, by key. Empty: all. */
  regions: readonly string[];
}

/**
 * What the rail's Extrude and Revolve act on when no region was clicked: a sketch and its regions,
 * chosen by the caller from what is displayed.
 */
export interface SketchTarget {
  sketch: FeatureId;
  regions: readonly string[];
}

/** Defaults for the rail's Extrude. */
const DEFAULT_EXTRUDE = { distance: 15, direction: 'forward', operation: 'new' } as const;

/**
 * An id for an extrude about to be made. Exported because the profile offer's live preview must use
 * the same id as the commit, or its faces belong to a feature that is never added.
 */
export function extrudeId(): FeatureId {
  return `extrude-${String(Date.now())}`;
}

interface GeometryDeps {
  run: Run;
  selectedRefs: readonly StableRef[];
  activePlane: SketchPlane | null;
  /** The sketch and regions the rail acts on, or null when nothing is displayed. */
  railTarget: () => SketchTarget | null;
  sessionRef: MutableRefObject<Session | null>;
  setView: (view: SessionView | null) => void;
  setSelectedRefs: (refs: readonly StableRef[]) => void;
  /** Asks about any body a new part touches (`use-bodies.ts`). */
  checkContacts: (face: StableRef) => void;
  say: (msg: string) => void;
  /** Draws one part in place of its solid while dragged; null removes it. */
  showPart: (part: PartPreview | null) => void;
}

export function useGeometry({
  run,
  selectedRefs,
  activePlane,
  railTarget,
  sessionRef,
  setView,
  setSelectedRefs,
  checkContacts,
  say,
  showPart,
}: GeometryDeps) {
  // Read through a ref: the preview coalescers below are created once (lazy useState) and must see
  // the current `setView` when a preview resolves.
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  const showPartRef = useRef(showPart);
  showPartRef.current = showPart;

  /**
   * Extrudes the unused regions of the newest displayed sketch. Clicking a region is the precise
   * way; this is the one-key way.
   *
   * Falls back to the starter box when the document has no sketch: that is how a first solid is
   * made, and the end-to-end suite relies on it.
   */
  const extrudeSketch = useCallback(
    (selected: readonly StableRef[] = []) => {
      // A picked face already has its pull handle: focus its distance and build nothing.
      if (selected.length === 1 && selected[0]?.kind === 'face') {
        document.querySelector<HTMLInputElement>('input[aria-label="Extrude distance"]')?.focus();
        return;
      }
      const target = railTarget();
      void run(async (session) => {
        // Only an empty document gets the starter box.
        if (session.document.features.length === 0) {
          return buildStarterBox(session, activePlane ?? 'XY');
        }
        if (target === null) {
          say('Draw a closed shape, or click an area of a sketch, to extrude it.');
          return session.rebuild();
        }
        return addExtrude(
          session,
          extrudeId(),
          target.sketch,
          { ...DEFAULT_EXTRUDE, regions: target.regions },
          { say, setSelectedRefs, checkContacts },
        );
      });
    },
    [run, railTarget, activePlane, setSelectedRefs, checkContacts, say],
  );

  /**
   * Extrudes a specific sketch with the values the profile offer settled on (the dragged distance,
   * not a fixed 15 mm).
   */
  const extrudeSketchById = useCallback(
    (id: FeatureId, sketch: FeatureId, params: ExtrudeParams) => {
      void run((session) => {
        if (!session.document.features.some((f) => f.id === sketch && f.type === 'sketch')) {
          say('That sketch is no longer in the document.');
          return session.rebuild();
        }
        return addExtrude(session, id, sketch, params, { say, setSelectedRefs, checkContacts });
      });
    },
    [run, setSelectedRefs, checkContacts, say],
  );

  /**
   * Rebuilds with an unjournalled extrude for a live drag, under the id the commit will use. Face
   * names carry their feature id, so a preview under another id would leave the commit unable to
   * find and select its own end face.
   */
  // One coalescer for the hook's lifetime, so a fast drag does not queue a `previewApply` per tick
  // (`coalesce-preview.ts`).
  const [extrudePreview] = useState(() =>
    coalescePreview<
      { id: FeatureId; sketch: FeatureId; params: ExtrudeParams },
      SessionView | null
    >(
      (value) => {
        const session = sessionRef.current;
        if (session === null) return Promise.resolve(null);
        return session.previewApply({
          op: 'addFeature',
          id: value.id,
          type: 'extrude',
          name: 'Extrude',
          index: session.document.features.length,
          params: { sketch: value.sketch, ...value.params, merge: true },
        });
      },
      (preview) => {
        if (preview !== null) setViewRef.current(preview);
      },
    ),
  );

  const previewExtrudeSketch = useCallback(
    (id: FeatureId, sketch: FeatureId, params: ExtrudeParams) => {
      if (params.distance <= 0) return;
      extrudePreview.request({ id, sketch, params });
    },
    [extrudePreview],
  );

  const addRevolve = useCallback(() => {
    const target = railTarget();
    void run((session) => {
      if (target === null) {
        say('Draw a closed shape before revolving it.');
        return session.rebuild();
      }
      const id = `revolve-${String(Date.now())}`;
      return addOrExplain(session, say, id, 'Revolve', {
        op: 'addFeature',
        id,
        type: 'revolve',
        name: 'Revolve',
        index: session.document.features.length,
        params: {
          sketch: target.sketch,
          axis: 'u',
          angleDegrees: 360,
          operation: 'new',
          regions: target.regions,
        },
      });
    });
  }, [run, railTarget, say]);

  const addFillet = useCallback(() => {
    const edges = selectedRefs.filter((ref) => ref.kind === 'edge');
    if (edges.length === 0) {
      say('Select an edge in the viewport first.');
      return;
    }
    const id = `fillet-${String(Date.now())}`;
    void run((session) =>
      addOrExplain(session, say, id, 'Fillet', {
        op: 'addFeature',
        id,
        type: 'fillet',
        name: 'Fillet',
        index: session.document.features.length,
        params: { edges: edges.map(formatRef), radius: 2 },
      }),
    );
  }, [run, selectedRefs, say]);

  const addShell = useCallback(() => {
    const faces = selectedRefs.filter((ref) => ref.kind === 'face');
    if (faces.length === 0) {
      say('Select at least one face to remove.');
      return;
    }
    const id = `shell-${String(Date.now())}`;
    void run((session) =>
      addOrExplain(session, say, id, 'Shell', {
        op: 'addFeature',
        id,
        type: 'shell',
        name: 'Shell',
        index: session.document.features.length,
        params: { faces: faces.map(formatRef), thickness: 2 },
      }),
    );
  }, [run, selectedRefs, say]);

  /**
   * Renames an item as its own journal step (`renameFeature`, which inverts), so it is undoable.
   * Geometry is unaffected.
   */
  const renameFeature = useCallback(
    (id: FeatureId, name: string) => {
      void run((session) => session.apply({ op: 'renameFeature', id, name }));
    },
    [run],
  );

  /** Deletes a feature. The journal records its inverse, so it undoes. */
  const removeFeature = useCallback(
    (id: FeatureId) => {
      void run((session) => session.apply({ op: 'removeFeature', id }));
    },
    [run],
  );

  /** Suppresses or unsuppresses a feature. */
  const setSuppressed = useCallback(
    (id: FeatureId, suppressed: boolean) => {
      void run((session) => session.apply({ op: 'suppressFeature', id, suppressed }));
    },
    [run],
  );

  const changeParam = useCallback(
    (id: FeatureId, key: string, value: unknown) => {
      void run((session) => {
        const feature = session.document.features.find((f) => f.id === id);
        if (feature === undefined) return session.rebuild();
        return session.apply({
          op: 'updateParams',
          id,
          params: { ...feature.params, [key]: value },
        });
      });
    },
    [run],
  );

  /**
   * Changes several parameters of a feature as one history step, writing only those. For images,
   * whose parameters include the image data, which a drag must not rewrite.
   */
  const patchParams = useCallback(
    (id: FeatureId, params: Readonly<Record<string, unknown>>) => {
      void run((session) => session.apply({ op: 'patchParams', id, params }));
    },
    [run],
  );

  /**
   * The feature the edge gizmo is editing. Rounding an edge spans several drags, so it is keyed on
   * the edge: dragging a different edge starts a new feature instead of overwriting the last one.
   */
  const editing = useRef<{ edgeKey: string; featureId: FeatureId; kind: EdgeOp } | null>(null);

  const applyEdgeGizmo = useCallback(
    (kind: EdgeOp, size: number) => {
      const edge = selectedRefs.find((ref) => ref.kind === 'edge');
      if (edge === undefined || size <= 0) return;
      const edgeKey = formatRef(edge);
      const params =
        kind === 'fillet'
          ? { edges: [edgeKey], radius: size }
          : { edges: [edgeKey], distance: size };

      void run(async (session) => {
        const prior = editing.current;
        // Stale once its feature is gone (removed, or never committed in this document), so an id
        // from a previous document is never written into this one.
        const resuming =
          prior !== null &&
          prior.edgeKey === edgeKey &&
          session.document.features.some((f) => f.id === prior.featureId);

        if (resuming && prior.kind === kind) {
          return session.apply({ op: 'updateParams', id: prior.featureId, params });
        }

        const id = `${kind}-${String(Date.now())}` as FeatureId;
        const add: Operation = {
          op: 'addFeature',
          id,
          type: kind,
          name: kind === 'fillet' ? 'Fillet' : 'Chamfer',
          // At the withdrawn one's index, so history order is kept.
          index: resuming
            ? session.document.features.findIndex((f) => f.id === prior.featureId)
            : session.document.features.length,
          params,
        };
        // Fillet and chamfer are different feature types, so switching withdraws the earlier one
        // and adds this one in its place, as one undo step.
        const tried = await session.tryApply(
          resuming ? [{ op: 'removeFeature', id: prior.featureId }, add] : add,
          id,
        );
        if (tried.refused !== null) {
          showPartRef.current(null);
          say(`${add.name} could not be applied: ${tried.refused}`);
          return tried.view;
        }
        editing.current = { edgeKey, featureId: id, kind };
        return tried.view;
      });
    },
    [run, selectedRefs, say],
  );

  // Coalesced like `extrudePreview` above.
  const [edgeGizmoPreview] = useState(() =>
    coalescePreview<Operation, SessionView | null>(
      (operation) => sessionRef.current?.previewApply(operation) ?? Promise.resolve(null),
      (preview) => {
        if (preview !== null) setViewRef.current(preview);
      },
    ),
  );

  // A round or bevel at the end of the document previews from its own solid
  // (`session-part-edit.ts`), like a face pull.
  const [edgePartPreview] = useState(() =>
    coalescePreview<{ edit: PartEdit; replacing: FeatureId | undefined }, PartPreview | null>(
      ({ edit, replacing }) =>
        sessionRef.current?.partPreview(edit, replacing) ?? Promise.resolve(null),
      (part) => showPartRef.current(part),
    ),
  );

  const previewEdgeGizmo = useCallback(
    (kind: EdgeOp, size: number) => {
      const edge = selectedRefs.find((r) => r.kind === 'edge');
      if (edge === undefined || size <= 0) return;
      const session = sessionRef.current;
      if (session === null) return;
      const id = `${kind}-preview`;
      const prior = editing.current;
      const features = session.document.features;
      const at =
        prior === null || prior.edgeKey !== formatRef(edge)
          ? -1
          : features.findIndex((feature) => feature.id === prior.featureId);
      if (at === -1 || at === features.length - 1) {
        const replacing = at === -1 ? undefined : prior?.featureId;
        edgePartPreview.request({ edit: { kind, edge, size }, replacing });
        return;
      }
      const updating =
        prior !== null &&
        prior.edgeKey === formatRef(edge) &&
        prior.kind === kind &&
        session.document.features.some((feature) => feature.id === prior.featureId);
      edgeGizmoPreview.request(
        updating
          ? {
              op: 'updateParams',
              id: prior.featureId,
              params:
                kind === 'fillet'
                  ? { edges: [formatRef(edge)], radius: size }
                  : { edges: [formatRef(edge)], distance: size },
            }
          : kind === 'fillet'
            ? {
                op: 'addFeature',
                id,
                type: 'fillet',
                name: 'Fillet',
                index: session.document.features.length,
                params: { edges: [formatRef(edge)], radius: size },
              }
            : {
                op: 'addFeature',
                id,
                type: 'chamfer',
                name: 'Chamfer',
                index: session.document.features.length,
                params: { edges: [formatRef(edge)], distance: size },
              },
      );
    },
    [selectedRefs, sessionRef, edgeGizmoPreview, edgePartPreview],
  );

  return {
    addFillet,
    addRevolve,
    addShell,
    changeParam,
    patchParams,
    renameFeature,
    removeFeature,
    setSuppressed,
    applyEdgeGizmo,
    previewEdgeGizmo,
    extrudeSketch,
    extrudeSketchById,
    previewExtrudeSketch,
  };
}

/**
 * Adds a feature if it builds, otherwise reports why and leaves the document unchanged (see
 * `tryApply`).
 */
export async function addOrExplain(
  session: Session,
  say: (message: string) => void,
  id: FeatureId,
  label: string,
  operation: Operation,
): Promise<SessionView> {
  const tried = await session.tryApply(operation, id);
  if (tried.refused !== null) say(`${label} could not be created: ${tried.refused}`);
  return tried.view;
}

/**
 * Adds one extrude, reports a kernel refusal and selects its end face (which opens the distance
 * gizmo). Shared by the rail button and the profile offer.
 */
async function addExtrude(
  session: Session,
  id: FeatureId,
  sketch: FeatureId,
  params: ExtrudeParams,
  report: {
    say: (msg: string) => void;
    setSelectedRefs: (refs: readonly StableRef[]) => void;
    checkContacts: (face: StableRef) => void;
  },
): Promise<SessionView> {
  // A sketch on a part adds to or cuts only that part, whatever Result is later set to.
  const onFace = session.document.features.find((f) => f.id === sketch)?.params.face;
  const targets = Array.isArray(onFace) ? onFace : [];
  const tried = await session.tryApply(
    {
      op: 'addFeature',
      id,
      type: 'extrude',
      name: 'Extrude',
      index: session.document.features.length,
      params: { sketch, ...params, targets, merge: true },
    },
    id,
  );
  if (tried.refused !== null) {
    report.say(`Extrude could not be created: ${tried.refused}`);
    return tried.view;
  }
  const next = tried.view;
  const normal = next.sketches.get(sketch)?.basis.normal;
  if (normal !== undefined) {
    const sign = params.direction === 'backward' ? -1 : 1;
    const cap = capFace(next, id, {
      x: normal.x * sign,
      y: normal.y * sign,
      z: normal.z * sign,
    });
    if (cap !== null) {
      report.setSelectedRefs([cap]);
      // A new part drawn into another is worth asking about.
      if (params.operation === 'new') report.checkContacts(cap);
    }
  }
  return next;
}

/**
 * The face of a new extrude furthest along its direction, which the user drags to change the
 * distance. Found geometrically because face tags are positional (`naming.ts`): `end` is whichever
 * sorted second, not necessarily the cap.
 */
function capFace(
  view: SessionView,
  feature: FeatureId,
  direction: { x: number; y: number; z: number },
): FaceRef | null {
  const display = view.display;
  if (display === null) return null;
  const { positions, indices, triangleFaces } = display.mesh;
  const reach = new Map<number, { sum: number; count: number }>();
  for (let t = 0; t < triangleFaces.length; t++) {
    const face = triangleFaces[t] ?? 0;
    const ref = display.faceRefs[face];
    if (ref?.kind !== 'face' || ref.feature !== feature) continue;
    const entry = reach.get(face) ?? { sum: 0, count: 0 };
    for (let corner = 0; corner < 3; corner++) {
      const vertex = (indices[t * 3 + corner] ?? 0) * 3;
      entry.sum +=
        (positions[vertex] ?? 0) * direction.x +
        (positions[vertex + 1] ?? 0) * direction.y +
        (positions[vertex + 2] ?? 0) * direction.z;
      entry.count += 1;
    }
    reach.set(face, entry);
  }
  let best: { face: number; along: number } | null = null;
  for (const [face, entry] of reach) {
    const along = entry.sum / entry.count;
    if (best === null || along > best.along) best = { face, along };
  }
  const ref = best === null ? null : display.faceRefs[best.face];
  return ref?.kind === 'face' ? ref : null;
}

/**
 * A 40×20 rectangle extruded 15 mm: a sketch and an extrude, as the document model defines a solid.
 * Shared so the starter path and the Extrude button agree.
 */
async function buildStarterBox(session: Session, plane: SketchPlane): Promise<SessionView> {
  const stamp = String(Date.now());
  const index = session.document.features.length;
  // Two undo steps, one rebuild: the sketch alone is never shown.
  await session.stage({
    op: 'addFeature',
    id: `sketch-${stamp}`,
    type: 'sketch',
    name: countedName(session.document, 'Sketch'),
    index,
    params: {
      plane,
      sketch: rectangleSketch(`s${stamp}`, { x: 0, y: 0, width: 40, height: 20 }),
    },
  });
  return session.apply({
    op: 'addFeature',
    id: `extrude-${stamp}`,
    type: 'extrude',
    name: 'Extrude',
    index: index + 1,
    params: { sketch: `sketch-${stamp}`, distance: 15, direction: 'forward', operation: 'new' },
  });
}
