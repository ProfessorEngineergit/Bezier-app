/**
 * Sketch mode: which sketch is being drawn, on what, and the pending extrude offer.
 *
 * - Pressing Sketch always starts a new sketch; existing sketches are edited from Items or the
 *   inspector.
 * - Every sketch with an unused region stays visible on its plane (`shownSketches`), and every
 *   closed region can be clicked.
 * - A sketch can be on an origin plane or a flat face (ADR 0013): pick the face while choosing a
 *   plane, or have one selected when pressing Sketch.
 *
 * The offer from clicking a region lives here because changing mode dismisses it, like Escape.
 */

import {
  type FeatureId,
  leanOf,
  planeToWorld,
  restingBasis,
  type SketchPlane,
  type StableRef,
} from '@bezier/core';
import type { ShownSketch, SketchAreaHit, ViewPlane } from '@bezier/renderer';
import type { ConstraintSolver } from '@bezier/solver';
import { type CategoryId, dockingFrom, NO_DOCKING } from '@bezier/ui';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { live } from './automation/live.js';
import { isPlaceholderSolver } from './placeholder-solver.js';
import type { Said } from './said.js';
import type { Session, SessionView } from './session.js';
import { variantAsTool } from './sketch-variants.js';
import { type ExtrudeParams, extrudeId, type SketchTarget } from './use-geometry.js';
import { type ActiveSurface, leaningSurface, originSurface, useSketch } from './use-sketch.js';
import type { ViewportHandle } from './Viewport.js';
import { shownSketches, sketchFromFeature } from './visible-sketch.js';

type Run = (change: (session: Session) => Promise<SessionView>) => void;
type Vec3 = { x: number; y: number; z: number };

/** A clicked region, offered for extruding but not yet extruded. */
export interface AreaOffer {
  /** Chosen up front so the preview builds under the id the commit will use. */
  id: FeatureId;
  sketch: FeatureId;
  anchor: Vec3;
  normal: Vec3;
  /**
   * Drawn on a part's face: the pull's sign is read as for a face pull (outward adds, inward cuts),
   * so a cut always goes into the material.
   */
  onFace: boolean;
  params: ExtrudeParams;
}

interface SketchModeDeps {
  category: CategoryId | null;
  setCategory: Dispatch<SetStateAction<CategoryId | null>>;
  view: SessionView | null;
  sessionRef: RefObject<Session | null>;
  viewportRef: RefObject<ViewportHandle | null>;
  selectedRefs: readonly StableRef[];
  selectedFeature: FeatureId | null;
  run: Run;
  say: (message: string | Said) => void;
  gridStep: number | null;
  /** The app's solver, for the constraint tools. */
  solver: () => ConstraintSolver | null;
}

export function useSketchMode({
  category,
  setCategory,
  view,
  sessionRef,
  viewportRef,
  selectedRefs,
  selectedFeature,
  run,
  say,
  gridStep,
  solver,
}: SketchModeDeps) {
  const [surface, setSurface] = useState<ActiveSurface | null>(null);
  /** The committed sketch being edited; hidden from the shown list meanwhile. */
  const [editing, setEditing] = useState<FeatureId | null>(null);
  live.sketch = { open: surface !== null, editing };
  /** A drawing tool requested before there was a plane. */
  const queued = useRef<string | null>(null);
  /**
   * The just-finished drawing, shown until the rebuild that stores it returns, so the sketch does
   * not blink out after Finish.
   */
  const [finished, setFinished] = useState<{ view: SessionView | null; shown: ShownSketch } | null>(
    null,
  );
  const [offer, setOffer] = useState<AreaOffer | null>(null);
  // The sketch whose region was clicked last. The offer ends with the mode (Move leaves Modeling),
  // but the region stays picked and Move acts on its sketch.
  const areaSketch = useRef<FeatureId | null>(null);
  /** For callers outside the mode: dropping the offer also forgets the picked sketch. */
  const setOfferFor = useCallback((next: SetStateAction<AreaOffer | null>) => {
    if (next === null) areaSketch.current = null;
    setOffer(next);
  }, []);
  // Other visible sketches in the drawing plane, for snapping.
  const docking = useMemo(
    () =>
      view === null || surface === null
        ? NO_DOCKING
        : dockingFrom(shownSketches(view.document, view, editing), surface.basis),
    [view, surface, editing],
  );
  const sketch = useSketch({
    run,
    solver,
    isStandIn: isPlaceholderSolver,
    surface,
    gridStep,
    docking,
    say,
  });

  // Adjusted during render rather than in an effect, so the offer disappears in the same paint as
  // the mode change.
  const [offerCategory, setOfferCategory] = useState(category);
  if (offerCategory !== category) {
    setOfferCategory(category);
    setOffer(null);
  }

  // A sketch surface never survives leaving its mode.
  useEffect(() => {
    if (category !== 'sketch') {
      setSurface(null);
      setEditing(null);
    }
  }, [category]);

  /** Activates a queued drawing tool once there is a plane. */
  const drawOn = useCallback(
    (next: ActiveSurface) => {
      setSurface(next);
      const tool = queued.current;
      queued.current = null;
      if (tool !== null) sketch.setTool(variantAsTool(tool));
    },
    [sketch],
  );

  /** A flat face as a sketch surface, from the kernel. Notifies when the face is not flat. */
  const faceSurface = useCallback(
    async (face: StableRef): Promise<ActiveSurface | null> => {
      const basis = (await sessionRef.current?.sketchBasisOn(face)) ?? null;
      if (basis === null) {
        say('Only a flat face can be sketched on.');
        return null;
      }
      return leaningSurface({ plane: nearestPlane(basis.normal), face, rest: basis });
    },
    [sessionRef, say],
  );

  /** Starts a new sketch: on the selected flat face, the plane the view faces, or asks. */
  const enter = useCallback(() => {
    sketch.clear();
    setEditing(null);
    setCategory('sketch');
    const [only] = selectedRefs;
    if (selectedRefs.length === 1 && only?.kind === 'face') {
      setSurface(null);
      void faceSurface(only).then((found) => {
        if (found !== null) drawOn(found);
      });
      return;
    }
    const facing = viewportRef.current?.sketchPlaneForView() ?? null;
    setSurface(facing === null ? null : originSurface(facing.plane, facing.lean));
  }, [sketch, setCategory, selectedRefs, faceSurface, drawOn, viewportRef]);

  /**
   * Starts a new sketch on a flat face the view was just squared to (Space). A curved face is left
   * alone: the view is already square, and there is nothing to say about a key that only looks.
   */
  const sketchOn = useCallback(
    async (face: StableRef) => {
      const basis = (await sessionRef.current?.sketchBasisOn(face)) ?? null;
      if (basis === null) return;
      sketch.clear();
      setEditing(null);
      setCategory('sketch');
      drawOn(leaningSurface({ plane: nearestPlane(basis.normal), face, rest: basis }));
    },
    [sessionRef, sketch, setCategory, drawOn],
  );

  /** Reopens a committed sketch so Finish writes back to it. */
  const edit = useCallback(
    (id: FeatureId) => {
      const feature = view?.document.features.find((candidate) => candidate.id === id);
      const source = feature === undefined ? null : sketchFromFeature(feature);
      if (source === null) return;
      const basis = view?.sketches.get(id)?.basis;
      if (source.face !== null && basis === undefined) {
        say('The face this sketch was drawn on no longer exists.');
        return;
      }
      setOffer(null);
      setCategory('sketch');
      setEditing(id);
      // The solved basis includes the lean; the rest basis is that with the lean removed, so
      // editing the lean starts from the right place.
      const lean = leanOf(feature?.params ?? {});
      setSurface(
        basis !== undefined
          ? leaningSurface(
              { plane: source.plane, face: source.face, rest: restingBasis(basis, lean) },
              lean,
            )
          : originSurface(source.plane, lean),
      );
      sketch.resume(id, source.sketch);
    },
    [view, sketch, setCategory, say],
  );

  /** Leaves sketch mode, keeping the drawing. An empty drawing is dropped. */
  const exit = useCallback(() => {
    if (surface !== null && sketch.draft.primitives.length > 0) {
      setFinished({
        view,
        shown: {
          id: 'pending-sketch',
          plane: surface.basis,
          sketch: sketch.draft,
          used: new Set(),
        },
      });
      sketch.finish();
    } else {
      sketch.clear();
      sketch.setTool(null);
    }
    setCategory(null);
    setSurface(null);
    setEditing(null);
  }, [surface, sketch, view, setCategory]);

  /**
   * Activates a drawing tool from the rail or its key. Without a plane, uses the one the view is
   * squared to, or waits for one to be picked.
   */
  const pickTool = useCallback(
    (id: string, next: string | null) => {
      if (category !== 'sketch' || surface === null) {
        if (category !== 'sketch') {
          sketch.clear();
          setEditing(null);
          setCategory('sketch');
        }
        const facing = viewportRef.current?.sketchPlaneForView() ?? null;
        if (facing !== null) {
          setSurface(originSurface(facing.plane, facing.lean));
          sketch.setTool(variantAsTool(id));
          queued.current = null;
        } else {
          queued.current = id;
          say('Choose a plane to sketch on first.');
        }
        return;
      }
      sketch.setTool(next === null ? null : variantAsTool(next));
    },
    [category, surface, sketch, setCategory, viewportRef, say],
  );

  /** Choosing where to draw: a datum plane, or a flat face of a body. */
  /** A plane clicked in the view, or the one the view cube faces, leaning between sides. */
  const pickPlane = useCallback(
    (picked: SketchPlane | ViewPlane) =>
      drawOn(
        typeof picked === 'string'
          ? originSurface(picked)
          : originSurface(picked.plane, picked.lean),
      ),
    [drawOn],
  );
  const pickFace = useCallback(
    (face: StableRef) => {
      void faceSurface(face).then((found) => {
        if (found !== null) drawOn(found);
      });
    },
    [faceSurface, drawOn],
  );

  /**
   * A click on a closed region. With a modifier, the region joins or leaves the pending offer on
   * the same sketch, so several regions extrude as one step.
   */
  const offerArea = useCallback(
    (hit: SketchAreaHit, additive: boolean) => {
      if (hit.sketch === 'pending-sketch') return;
      areaSketch.current = hit.sketch;
      const feature = view?.document.features.find((candidate) => candidate.id === hit.sketch);
      const onFace = feature !== undefined && sketchFromFeature(feature)?.face != null;
      setOffer((current) => {
        if (additive && current !== null && current.sketch === hit.sketch) {
          const had = current.params.regions.includes(hit.area);
          const regions = had
            ? current.params.regions.filter((key) => key !== hit.area)
            : [...current.params.regions, hit.area];
          return regions.length === 0
            ? null
            : { ...current, params: { ...current.params, regions } };
        }
        return {
          id: extrudeId(),
          sketch: hit.sketch,
          anchor: planeToWorld(hit.plane, hit.at.u, hit.at.v),
          normal: hit.plane.normal,
          onFace,
          // Zero until dragged: a solid appears when a size is chosen, not on click. A sketch on a
          // face adds to that body by default, like a face pull.
          params: {
            distance: 0,
            direction: 'forward',
            operation: onFace ? 'add' : 'new',
            regions: [hit.area],
          },
        };
      });
    },
    [view],
  );

  const offerRef = useRef(offer);
  offerRef.current = offer;
  /** Withdraws the pending offer; reports whether there was one. */
  const cancelOffer = useCallback((): boolean => {
    if (offerRef.current === null) return false;
    setOffer(null);
    // Also drop the preview geometry, or the unrequested extrude stays until the next rebuild.
    void run((session) => session.rebuild());
    return true;
  }, [run]);

  /** Removes and returns the sketch of the clicked region, which Move then acts on. */
  const takeOfferedSketch = useCallback((): FeatureId | null => {
    const sketchId = areaSketch.current ?? offerRef.current?.sketch ?? null;
    areaSketch.current = null;
    cancelOffer();
    return sketchId;
  }, [cancelOffer]);

  /** Resets everything when another document opens. */
  const reset = useCallback(() => {
    setOffer(null);
    setFinished(null);
    setSurface(null);
    setEditing(null);
  }, []);

  const shown =
    view === null ? [] : [...shownSketches(view.document, view, editing, selectedFeature)];
  if (finished !== null && finished.view === view) shown.push(finished.shown);

  /**
   * What the rail's Extrude acts on without a click: the pending offer's regions, else the unused
   * regions of the newest visible sketch.
   */
  const railTarget = (): SketchTarget | null => {
    if (offer !== null) return { sketch: offer.sketch, regions: offer.params.regions };
    for (let index = shown.length - 1; index >= 0; index -= 1) {
      const item = shown[index];
      if (item === undefined || view === null) continue;
      const areas = view.sketches.get(item.id)?.regions.map((region) => region.key) ?? [];
      const unused = areas.filter((key) => !item.used.has(key));
      if (unused.length === 0) continue;
      return { sketch: item.id, regions: item.used.size === 0 ? [] : unused };
    }
    return null;
  };

  /**
   * Offers the unused regions of the newest visible sketch for extruding, as a click would: the
   * gizmo and distance field open and nothing is built yet. Used by Extrude when there is a
   * drawing. False when no sketch has a region to offer.
   */
  const offerOnShow = (): boolean => {
    if (view === null) return false;
    for (let index = shown.length - 1; index >= 0; index -= 1) {
      const item = shown[index];
      if (item === undefined || item.id === 'pending-sketch') continue;
      const open = (view.sketches.get(item.id)?.regions ?? []).filter(
        (region) => !item.used.has(region.key),
      );
      const [first] = open;
      if (first === undefined || first.outline.length === 0) continue;
      // The handle sits at the centre of the first region's outline.
      const u = first.outline.reduce((sum, point) => sum + point.x, 0) / first.outline.length;
      const v = first.outline.reduce((sum, point) => sum + point.y, 0) / first.outline.length;
      const feature = view.document.features.find((candidate) => candidate.id === item.id);
      const onFace = feature !== undefined && sketchFromFeature(feature)?.face != null;
      setOffer({
        id: extrudeId(),
        sketch: item.id as FeatureId,
        anchor: planeToWorld(item.plane, u, v),
        normal: item.plane.normal,
        onFace,
        params: {
          distance: 0,
          direction: 'forward',
          operation: onFace ? 'add' : 'new',
          regions: open.map((region) => region.key),
        },
      });
      return true;
    }
    return false;
  };

  /**
   * Leaves sketch mode keeping the drawing, if one is in progress; returns whether there was one.
   */
  const exitIfDrawing = (): boolean => {
    if (category !== 'sketch' || surface === null || sketch.draft.primitives.length === 0)
      return false;
    exit();
    return true;
  };

  return {
    exitIfDrawing,
    offerOnShow,
    sketch,
    surface,
    setSurface,
    editing,
    enter,
    sketchOn,
    edit,
    exit,
    pickTool,
    pickPlane,
    pickFace,
    shown,
    railTarget,
    offer,
    setOffer: setOfferFor,
    offerArea,
    cancelOffer,
    takeOfferedSketch,
    reset,
  };
}

/** The origin plane a face is most nearly parallel to; its fallback name when saved. */
function nearestPlane(normal: Vec3): SketchPlane {
  const x = Math.abs(normal.x);
  const y = Math.abs(normal.y);
  const z = Math.abs(normal.z);
  if (z >= x && z >= y) return 'XY';
  return y >= x ? 'XZ' : 'YZ';
}
