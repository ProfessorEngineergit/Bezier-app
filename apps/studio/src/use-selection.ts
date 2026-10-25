/**
 * Viewport click selection and what depends on it: which gizmo is shown, where it is anchored and
 * whether the move tool has a body. Kept in one place so these cannot drift apart (e.g. a gizmo
 * left on a face no longer selected).
 *
 * Measure mode is handled here too: while it is on, a click records a point instead of selecting.
 */

import { formatRef, type StableRef } from '@bezier/core';
import type { EdgeFrame } from '@bezier/renderer';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useCallback } from 'react';
import type { SessionView } from './session.js';
import type { ViewportHandle } from './Viewport.js';

type Vec3 = { x: number; y: number; z: number };

interface SelectionDeps {
  view: SessionView | null;
  viewportRef: RefObject<ViewportHandle | null>;
  measureMode: boolean;
  setMeasurePoints: Dispatch<SetStateAction<readonly Vec3[]>>;
  selectedRefs: readonly StableRef[];
  setSelectedRefs: Dispatch<SetStateAction<readonly StableRef[]>>;
  setGizmoAnchor: Dispatch<SetStateAction<Vec3 | null>>;
  setGizmoFrame: Dispatch<SetStateAction<EdgeFrame | null>>;
  setMoveMode: Dispatch<SetStateAction<boolean>>;
}

export interface SelectionHandlers {
  /** A single click: replaces, or adds/removes when a modifier is held. */
  pick: (ref: StableRef | null, additive: boolean, point: Vec3 | null) => void;
  /**
   * A double-click: the whole body under the cursor. With a modifier it is added, or removed when
   * already fully selected (audit A13).
   */
  selectBody: (ref: StableRef | null, additive?: boolean) => void;
  /** Every face of the model. */
  selectAll: () => void;
  /** Nothing selected, no gizmo, no move mode. */
  deselectAll: () => void;
}

export function useSelection({
  view,
  viewportRef,
  measureMode,
  setMeasurePoints,
  selectedRefs,
  setSelectedRefs,
  setGizmoAnchor,
  setGizmoFrame,
  setMoveMode,
}: SelectionDeps): SelectionHandlers {
  const deselectAll = useCallback(() => {
    setSelectedRefs([]);
    setGizmoAnchor(null);
    setGizmoFrame(null);
    setMoveMode(false);
  }, [setSelectedRefs, setGizmoAnchor, setGizmoFrame, setMoveMode]);

  const faceRefsOf = useCallback(
    (): readonly StableRef[] =>
      (view?.display?.faceRefs ?? []).filter(
        (candidate): candidate is StableRef => candidate !== null,
      ),
    [view],
  );

  const selectAll = useCallback(() => {
    const faces = faceRefsOf();
    setSelectedRefs(faces);
    setGizmoAnchor(null);
    setGizmoFrame(null);
    setMoveMode(faces.length > 0);
  }, [faceRefsOf, setSelectedRefs, setGizmoAnchor, setGizmoFrame, setMoveMode]);

  const pick = useCallback(
    (ref: StableRef | null, additive: boolean, point: Vec3 | null) => {
      // In measure mode clicks store points and do not select geometry.
      if (measureMode) {
        if (point !== null) {
          // A third point turns two distances into an angle (audit F-028).
          setMeasurePoints((prev) => (prev.length < 3 ? [...prev, point] : prev));
        }
        return;
      }

      setMoveMode(false);

      setSelectedRefs((current) => {
        if (ref === null) return additive ? current : [];
        const key = formatRef(ref);
        if (!additive) return [ref];
        return current.some((r) => formatRef(r) === key)
          ? current.filter((r) => formatRef(r) !== key)
          : [...current, ref];
      });

      // Gizmo anchor: a plain click on one edge anchors it at the hit point along the edge
      // direction; anything else clears it.
      if (!additive && ref?.kind === 'edge' && point !== null) {
        const frame = viewportRef.current?.edgeFrame(ref, point) ?? null;
        setGizmoFrame(frame);
        setGizmoAnchor(frame?.snap ?? point);
      } else if (!additive) {
        setGizmoAnchor(null);
        setGizmoFrame(null);
      }
    },
    [
      measureMode,
      viewportRef,
      setMeasurePoints,
      setSelectedRefs,
      setGizmoAnchor,
      setGizmoFrame,
      setMoveMode,
    ],
  );

  /** Body ownership comes from topology, so touching or overlapping copies stay separate. */
  const selectBody = useCallback(
    (ref: StableRef | null, additive = false) => {
      if (measureMode) return;
      // A body selection is many faces, never a single edge, so there is no edge gizmo.
      setGizmoAnchor(null);
      setGizmoFrame(null);
      if (ref === null) {
        if (!additive) setSelectedRefs([]);
        return;
      }
      const key = formatRef(ref);
      const body =
        view?.display?.bodyRefs?.find((group) => group.some((face) => formatRef(face) === key)) ??
        faceRefsOf();
      let next = body;
      if (additive) {
        // The double-click's two clicks already toggled the face under it twice, so the body's
        // other faces tell whether it was selected.
        const held = new Set(selectedRefs.map(formatRef));
        const keys = body.map(formatRef);
        const others = keys.filter((k) => k !== key);
        const all = others.length === 0 ? held.has(key) : others.every((k) => held.has(k));
        next = all
          ? selectedRefs.filter((face) => !keys.includes(formatRef(face)))
          : [...selectedRefs, ...body.filter((face) => !held.has(formatRef(face)))];
      }
      setSelectedRefs(next);
      // Nothing left to move once the last body is removed.
      setMoveMode(next.length > 0);
    },
    [
      measureMode,
      view,
      faceRefsOf,
      selectedRefs,
      setSelectedRefs,
      setGizmoAnchor,
      setGizmoFrame,
      setMoveMode,
    ],
  );

  return { pick, selectBody, selectAll, deselectAll };
}
