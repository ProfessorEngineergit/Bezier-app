/**
 * Sketching, from the first click to a committed feature. Holds the in-progress state (tool, draft,
 * rubber band) outside `App.tsx`.
 *
 * The draft is not journalled: it is the state of the user's hand, not of the document, and
 * journalling every click would make undo step through the drawing. The sketch is committed once,
 * on Finish Sketch, as a single feature.
 */

import {
  type FeatureId,
  formatRef,
  leanedBasis,
  type PlaneBasis,
  type PlaneLean,
  planeBasis,
  type SketchPlane,
  type StableRef,
  sampleSpline,
} from '@bezier/core';
import type { ConstraintSolver, Sketch, SketchId } from '@bezier/solver';
import {
  anchorAtOrigin,
  arcThrough,
  type ConstraintTool,
  centerRectangleAt,
  circleFromCenter,
  connect,
  constrain,
  curveNear,
  type Docking,
  deleteSketchPrimitives,
  dimension,
  type EditResult,
  emptySketch,
  ensurePoint,
  extendAt,
  isClosed,
  isShapeTool,
  lineNear,
  markNewAsConstruction,
  type Point2D,
  pointNear,
  projectOutline,
  rectangleAt,
  roundCorner,
  type SketchTool,
  SNAP_DISTANCE,
  SNAP_NAMES,
  sampleArc,
  sampleCircle,
  setCircleRadius,
  setConstraintValue,
  setLineLength,
  shapeClick,
  snapToGrid,
  solveInto,
  splineThrough,
  splitAt,
  toggleConstruction,
  trimAt,
  unconstrain,
  withAngle,
} from '@bezier/ui';
import { useCallback, useRef, useState } from 'react';
import { countedName } from './feature-names.js';
import type { Said } from './said.js';
import type { Session, SessionView } from './session.js';
import type { SketchState } from './sketch-state.js';
import {
  holdTypedDimensions,
  lengthTarget,
  type RectangleSize,
  rectangleTarget,
} from './sketch-typed-shape.js';
import { useDockedSnap } from './use-docked-snap.js';

export type { SketchState } from './sketch-state.js';

import { touchedBy, useSketchDiagnosis } from './use-sketch-diagnosis.js';
import { useSketchGrip } from './use-sketch-grip.js';

type Run = (change: (session: Session) => Promise<SessionView>) => void;

/**
 * The surface being drawn on: an origin plane or a flat face of a body (ADR 0013). `plane` is saved
 * as the feature's origin plane; for a face sketch it is only a fallback name.
 */
export interface ActiveSurface {
  plane: SketchPlane;
  face: StableRef | null;
  /** The drawing basis: `rest` with `lean` applied. */
  basis: PlaneBasis;
  /** The plane or face itself, before any lean. */
  rest: PlaneBasis;
  /** Tilt, rotation and offset, saved with the sketch on Finish. */
  lean: PlaneLean;
}

export const NO_LEAN: PlaneLean = { offset: 0, tilt: 0, turn: 0 };

/** A surface based on `rest`, tilted by `lean`. */
export function leaningSurface(
  surface: Omit<ActiveSurface, 'basis' | 'lean'>,
  lean: PlaneLean = NO_LEAN,
): ActiveSurface {
  return { ...surface, lean, basis: leanedBasis(surface.rest, lean) };
}

/** One of the three origin planes as a sketch surface. */
export function originSurface(plane: SketchPlane, lean: PlaneLean = NO_LEAN): ActiveSurface {
  return leaningSurface({ plane, face: null, rest: planeBasis(plane) ?? ORIGIN_XY }, lean);
}

const ORIGIN_XY: PlaneBasis = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
  yDirection: { x: 0, y: 1, z: 0 },
};

interface SketchDeps {
  run: Run;
  /** The app's solver, used on every constraint change. Null before it loads. */
  solver: () => ConstraintSolver | null;
  /** Whether that solver is the stand-in, which stores constraints but enforces none. */
  isStandIn: (solver: ConstraintSolver) => boolean;
  surface: ActiveSurface | null;
  gridStep: number | null;
  /** Other sketches in the plane, whose points and lines are also snap targets. */
  docking: Docking;
  say: (message: string | Said) => void;
}

export function useSketch({
  run,
  solver,
  isStandIn,
  surface,
  gridStep,
  docking,
  say,
}: SketchDeps): SketchState {
  const { snapCandidate, snapSketchPoint } = useDockedSnap(docking);
  const [tool, setToolState] = useState<SketchTool | null>(null);
  const [draft, setDraft] = useState<Sketch>(emptySketch);
  const [pending, setPending] = useState<readonly Point2D[]>([]);
  const [snap, setSnap] = useState<string | null>(null);
  const [selected, setSelected] = useState<readonly SketchId[]>([]);
  /**
   * Digits typed while dragging out a shape; '' means the pointer alone decides. Kept as text so a
   * half-typed "1." survives to become "1.5".
   */
  const [typed, setTypedState] = useState('');

  /**
   * The draft, readable synchronously. A click must read the draft and advance the anchor exactly
   * once; doing that in a `setDraft` updater breaks under StrictMode, which calls updaters twice
   * (the second run snapped onto the point the first had just anchored, and a zero-length segment
   * is refused). So handlers compute the next draft from this ref and pass React the result.
   */
  const draftRef = useRef<Sketch>(emptySketch());
  const { freedom, defined, flags, setConflicts } = useSketchDiagnosis(draft, solver, isStandIn);

  /**
   * Where the shape in progress started. For a line, the start of the next segment; it survives the
   * click so chains continue. For a rectangle, the first corner, cleared on the second click.
   *
   * `created` distinguishes a point `ensurePoint` added from an existing point it joined. Only the
   * former may be removed when the shape is abandoned; a joined point belongs to other geometry.
   */
  const anchor = useRef<{ id: string; at: Point2D; created: boolean } | null>(null);
  /**
   * The committed sketch this draft came from, or null for a new one. A ref, not state, since only
   * `finish` reads it.
   */
  const editing = useRef<FeatureId | null>(null);
  /** The typed length, readable synchronously by the click that uses it. */
  const typedRef = useRef('');
  const rectangleSize = useRef<RectangleSize>({ axis: 'u', u: '', v: '' });
  const refreshPending = useRef<(at: Point2D | null) => void>(() => undefined);
  const placePending = useRef<(at: Point2D) => void>(() => undefined);
  /** Last pointer position, giving a typed length its direction. */
  const cursor = useRef<Point2D | null>(null);
  /** The second endpoint while the third click positions an arc's bulge. */
  const arcEnd = useRef<{ id: string; at: Point2D; created: boolean } | null>(null);
  /** Clicks collected by a shape tool so far (a polygon's centre, a slot's first end). */
  const shapeClicks = useRef<readonly Point2D[]>([]);

  /** The one place the draft changes, so the ref and the state never disagree. */
  const [drawingConstruction, setDrawingConstructionState] = useState(false);
  const constructionRef = useRef(false);
  const setDrawingConstruction = useCallback((on: boolean) => {
    constructionRef.current = on;
    setDrawingConstructionState(on);
  }, []);

  /**
   * Draft snapshots before each change, newest last, so Undo while sketching reverts any change
   * (trim, chamfer, constraint), not only the last line. Reset for every new or reopened sketch.
   */
  const history = useRef<Sketch[]>([]);

  /** Replaces the drawing. `record` is false for changes that are not their own undo step. */
  const commitDraft = useCallback((next: Sketch, record = true) => {
    // With the Centerline tool, everything added is construction geometry.
    const marked = constructionRef.current ? markNewAsConstruction(draftRef.current, next) : next;
    const kept = anchorAtOrigin(draftRef.current, marked);
    if (record && kept !== draftRef.current) {
      history.current.push(draftRef.current);
      if (history.current.length > 200) history.current.shift();
    }
    draftRef.current = kept;
    setDraft(kept);
  }, []);

  /** Starts a fresh drawing with empty undo history. */
  const resetDraft = useCallback(
    (sketch: Sketch) => {
      history.current = [];
      commitDraft(sketch, false);
    },
    [commitDraft],
  );

  /**
   * Removes the point `ensurePoint` created for the shape in progress. The first click of a line,
   * circle or arc adds a real point to the draft, tracked by `anchor`/`arcEnd`; when the shape is
   * abandoned (tool switch, Escape) that point must go too, or it ends up as a stray vertex in the
   * saved feature.
   */
  const abandonPending = useCallback(() => {
    const orphaned = new Set<SketchId>();
    if (anchor.current?.created === true) orphaned.add(anchor.current.id);
    if (arcEnd.current?.created === true) orphaned.add(arcEnd.current.id);
    if (orphaned.size > 0) {
      const next = deleteSketchPrimitives(draftRef.current, orphaned);
      commitDraft(next, false);
      // Removing the shape's first point returns to the previous step; drop that snapshot so a
      // later Undo does not stop on the same drawing twice.
      const top = history.current[history.current.length - 1];
      if (top !== undefined && JSON.stringify(top) === JSON.stringify(next)) history.current.pop();
    }
  }, [commitDraft]);

  const setTool = useCallback(
    (next: SketchTool | null) => {
      setToolState(next);
      // A plain tool draws normal lines; the Centerline command sets this again afterwards.
      constructionRef.current = false;
      setDrawingConstructionState(false);
      if (next !== null) setSelected([]);
      // A tool change abandons the previous tool's half-drawn shape.
      abandonPending();
      anchor.current = null;
      arcEnd.current = null;
      shapeClicks.current = [];
      typedRef.current = '';
      rectangleSize.current = { axis: 'u', u: '', v: '' };
      setTypedState('');
      setPending([]);
    },
    [abandonPending],
  );

  const cancelShape = useCallback(() => {
    // Escape finishes an open spline, keeping the clicked points.
    if (tool === 'spline' && shapeClicks.current.length >= 2) {
      const done = splineThrough(draftRef.current, shapeClicks.current, false, SNAP_DISTANCE);
      if (done !== null) commitSolvedRef.current(done);
    }
    abandonPending();
    anchor.current = null;
    arcEnd.current = null;
    shapeClicks.current = [];
    typedRef.current = '';
    rectangleSize.current = { axis: 'u', u: '', v: '' };
    setTypedState('');
    setPending([]);
  }, [abandonPending, tool]);

  /**
   * Removes the last drawn element and points only it used. The document undo cannot help here: the
   * sketch is not journalled until it is finished.
   */
  const undoLast = useCallback((): boolean => {
    // A shape still being dragged out is the newest thing, so undo removes it first.
    if (anchor.current !== null || arcEnd.current !== null) {
      cancelShape();
      return true;
    }
    const previous = history.current.pop();
    if (previous === undefined) return false;
    commitDraft(previous, false);
    setSelected([]);
    return true;
  }, [cancelShape, commitDraft]);

  const clear = useCallback(() => {
    anchor.current = null;
    // A cleared draft no longer edits anything; keeping the id would make the next Finish overwrite
    // the abandoned sketch.
    editing.current = null;
    arcEnd.current = null;
    setPending([]);
    setSelected([]);
    resetDraft(emptySketch());
  }, [resetDraft]);

  const select = useCallback((at: Point2D, additive: boolean, hitRadius: number) => {
    const line = lineNear(draftRef.current, at, hitRadius);
    const curve = curveNear(draftRef.current, at, hitRadius);
    // Points first, but only very close: a line's endpoints are also points, and a click slightly
    // along the line should still pick the line.
    const point = pointNear(draftRef.current, at, hitRadius * 0.6);
    const hit =
      point !== null
        ? { id: point }
        : line === null || (curve !== null && curve.distance < line.distance)
          ? curve
          : line;
    setSelected((current) => {
      if (hit === null) return additive ? current : [];
      if (!additive) return [hit.id];
      return current.includes(hit.id)
        ? current.filter((id) => id !== hit.id)
        : [...current, hit.id];
    });
  }, []);

  const toggleConstructionSelected = useCallback(() => {
    if (selected.length === 0) return;
    const was = constructionRef.current;
    // Toggling adds nothing new, whatever mode is on.
    constructionRef.current = false;
    commitDraft(toggleConstruction(draftRef.current, selected));
    constructionRef.current = was;
  }, [selected, commitDraft]);

  const project = useCallback(
    (outline: readonly (readonly { x: number; y: number }[])[]) => {
      commitDraft(projectOutline(draftRef.current, outline));
    },
    [commitDraft],
  );

  const deleteSelected = useCallback(() => {
    if (selected.length === 0) return;
    commitDraft(deleteSketchPrimitives(draftRef.current, new Set(selected)));
    setSelected([]);
  }, [selected, commitDraft]);

  /**
   * Commits a drawing with changed constraints, solved. A contradiction is refused and the
   * contradicted constraints named, so the draft never becomes unsolvable. Returns whether the
   * change was kept.
   */
  const commitSolved = useCallback(
    (next: Sketch): boolean => {
      const active = solver();
      if (active === null) {
        commitDraft(next);
        return true;
      }
      const solved = solveInto(next, active);
      if (!solved.ok) {
        say(solved.message);
        // Contradicted constraints are marked until the next accepted change. When the solver
        // cannot name them, those on the touched elements are used.
        setConflicts(
          new Set(
            solved.conflicting.length > 0 ? solved.conflicting : touchedBy(draftRef.current, next),
          ),
        );
        return false;
      }
      setConflicts(new Set());
      commitDraft(solved.sketch);
      return true;
    },
    [solver, commitDraft, say, setConflicts],
  );

  const commitSolvedRef = useRef(commitSolved);
  commitSolvedRef.current = commitSolved;

  // A typed length or radius applies immediately and is kept as a dimension so the solver holds it
  // when other things change.
  const changeLineLength = useCallback(
    (id: SketchId, length: number) => {
      commitSolved(dimension(setLineLength(draftRef.current, id, length), id, length));
    },
    [commitSolved],
  );

  const changeCircleRadius = useCallback(
    (id: SketchId, radius: number) => {
      commitSolved(dimension(setCircleRadius(draftRef.current, id, radius), id, radius));
    },
    [commitSolved],
  );

  /**
   * A solved edit of the picked elements (offset, mirror, pattern, transform), or why it failed.
   */
  const applyEdit = useCallback(
    (result: EditResult): boolean => {
      if (!result.ok) {
        say(result.message);
        return false;
      }
      const kept = commitSolved(result.sketch);
      if (kept) setSelected([]);
      return kept;
    },
    [commitSolved, say],
  );

  const changeConstraintValue = useCallback(
    (id: SketchId, value: number) => {
      commitSolved(setConstraintValue(draftRef.current, id, value));
    },
    [commitSolved],
  );

  const constrainSelection = useCallback(
    (tool: ConstraintTool) => {
      const result = constrain(draftRef.current, tool, selected);
      if (!result.ok) {
        say(result.message);
        return;
      }
      if (!commitSolved(result.sketch)) return;
      const active = solver();
      if (active !== null && isStandIn(active)) {
        say({
          title: 'Constraint kept with the sketch',
          detail: 'It takes effect once the constraint solver is in.',
        });
      }
    },
    [selected, commitSolved, solver, isStandIn, say],
  );

  const removeConstraint = useCallback(
    (id: SketchId) => {
      commitSolved(unconstrain(draftRef.current, id));
    },
    [commitSolved],
  );

  const roundSelectedCorner = useCallback(
    (style: 'fillet' | 'chamfer', size: number) => {
      const result = roundCorner(draftRef.current, selected, style, size);
      if (!result.ok) {
        say(result.message);
        return;
      }
      if (commitSolved(result.sketch)) setSelected([]);
    },
    [selected, commitSolved, say],
  );

  const changeAngle = useCallback(
    (id: SketchId, degrees: number) => {
      commitSolved(withAngle(draftRef.current, id, degrees));
    },
    [commitSolved],
  );

  const move = useCallback(
    (at: Point2D | null, hitRadius = SNAP_DISTANCE) => {
      const from = anchor.current;
      cursor.current = at;
      // Only where the tool places a point: not a circle's rim or an arc's bulge.
      const places = tool !== null && (from === null || (tool !== 'circle' && tool !== 'arc'));
      const fell =
        at === null || !places ? null : snapCandidate(draftRef.current, at, hitRadius, gridStep);
      setSnap(fell?.kind == null ? null : SNAP_NAMES[fell.kind]);
      // A spline being placed previews the curve with the pointer as its next point.
      if (tool === 'spline') {
        const clicks = shapeClicks.current;
        const next =
          at === null ? null : snapSketchPoint(draftRef.current, at, hitRadius, gridStep);
        setPending(
          clicks.length === 0 || next === null
            ? []
            : sampleSpline(
                [...clicks, next].map((p) => ({ x: p.u, y: p.v })),
                false,
              ).map((p) => ({ u: p.x, v: p.y })),
        );
        return;
      }
      // A shape collecting clicks shows them joined to the pointer.
      if (isShapeTool(tool)) {
        const clicks = shapeClicks.current;
        setPending(
          clicks.length === 0 || at === null
            ? []
            : [...clicks, snapSketchPoint(draftRef.current, at, hitRadius, gridStep)],
        );
        return;
      }
      if (from === null || at === null) {
        setPending([]);
        return;
      }
      const current = draftRef.current;
      if (tool === 'rectangle' || tool === 'center-rectangle') {
        const target = rectangleTarget(
          from.at,
          snapSketchPoint(current, at, hitRadius, gridStep),
          rectangleSize.current,
          tool === 'center-rectangle',
        );
        const opposite =
          tool === 'center-rectangle'
            ? { u: from.at.u * 2 - target.u, v: from.at.v * 2 - target.v }
            : from.at;
        setPending([
          opposite,
          { u: target.u, v: opposite.v },
          target,
          { u: opposite.u, v: target.v },
          opposite,
        ]);
        return;
      }
      if (tool === 'circle') {
        const target = lengthTarget(from.at, snapToGrid(at, gridStep), typedRef.current);
        const preview = circleFromCenter(current, from.id, target);
        const last = preview.primitives[preview.primitives.length - 1];
        const circle =
          preview.primitives.length > current.primitives.length && last?.kind === 'circle'
            ? last
            : undefined;
        setPending(circle === undefined ? [] : sampleCircle(preview, circle));
        return;
      }
      if (tool === 'arc' && arcEnd.current !== null) {
        const target = snapToGrid(at, gridStep);
        const preview = arcThrough(current, from.id, arcEnd.current.id, target);
        const last = preview.primitives[preview.primitives.length - 1];
        const arc =
          preview.primitives.length > current.primitives.length && last?.kind === 'arc'
            ? last
            : undefined;
        setPending(arc === undefined ? [from.at, arcEnd.current.at] : sampleArc(preview, arc));
        return;
      }
      setPending([
        from.at,
        lengthTarget(from.at, snapSketchPoint(current, at, hitRadius, gridStep), typedRef.current),
      ]);
    },
    [tool, gridStep, snapCandidate, snapSketchPoint],
  );

  refreshPending.current = move;

  /** The single setter for the typed buffer, so ref and state stay in sync. */
  const setTyped = useCallback(
    (next: string) => {
      typedRef.current = next;
      setTypedState(next);
      if (tool === 'rectangle' || tool === 'center-rectangle')
        rectangleSize.current[rectangleSize.current.axis] = next;
      refreshPending.current(cursor.current);
    },
    [tool],
  );

  /**
   * A digit typed while dragging out a shape: drag a line roughly, type 50 and it is 50 mm. The
   * pointer still sets the direction. Ignored when nothing is being dragged, since there is no
   * direction.
   */
  const typeLength = useCallback(
    (key: string) => {
      if (tool === 'spline' && key === 'Enter' && shapeClicks.current.length >= 2) {
        const done = splineThrough(draftRef.current, shapeClicks.current, false, SNAP_DISTANCE);
        shapeClicks.current = [];
        setPending([]);
        if (done !== null) commitSolvedRef.current(done);
        return true;
      }
      if (anchor.current === null) return false;
      if (key === 'Tab' && (tool === 'rectangle' || tool === 'center-rectangle')) {
        rectangleSize.current.axis = rectangleSize.current.axis === 'u' ? 'v' : 'u';
        typedRef.current = rectangleSize.current[rectangleSize.current.axis];
        setTypedState(typedRef.current);
        return true;
      }
      if (
        key === 'Enter' &&
        cursor.current !== null &&
        (typedRef.current !== '' ||
          tool === 'rectangle' ||
          tool === 'center-rectangle' ||
          tool === 'circle')
      ) {
        placePending.current(cursor.current);
        return true;
      }
      if (key === 'Backspace') {
        setTyped(typedRef.current.slice(0, -1));
        return true;
      }
      // Only one decimal point.
      if (key === '.' && typedRef.current.includes('.')) return true;
      if (!/^[0-9.]$/.test(key)) return false;
      setTyped(typedRef.current + key);
      return true;
    },
    [setTyped, tool],
  );

  /**
   * Where a click lands given the typed length: the pointer position if nothing sensible was typed,
   * otherwise the pointer's direction at the typed distance.
   */
  const withTypedLength = useCallback(
    (from: Point2D, at: Point2D): Point2D => lengthTarget(from, at, typedRef.current),
    [],
  );

  const click = useCallback(
    (at: Point2D, additive = false, hitRadius = SNAP_DISTANCE) => {
      if (tool === null) return select(at, additive, hitRadius);

      const current = draftRef.current;
      const from = anchor.current;

      if (tool === 'extend' || tool === 'split') {
        const result = (tool === 'extend' ? extendAt : splitAt)(current, at, hitRadius);
        if (result.ok) commitDraft(result.sketch);
        else say(result.message);
        return;
      }

      if (tool === 'spline') {
        const target = snapSketchPoint(current, at, hitRadius, gridStep);
        const clicks = shapeClicks.current;
        const first = clicks[0];
        // Clicking the first point closes it; elsewhere adds another point.
        if (
          first !== undefined &&
          clicks.length >= 3 &&
          Math.hypot(target.u - first.u, target.v - first.v) <= hitRadius
        ) {
          const done = splineThrough(current, clicks, true, hitRadius);
          shapeClicks.current = [];
          setPending([]);
          if (done !== null) commitSolved(done);
          return;
        }
        shapeClicks.current = [...clicks, target];
        return;
      }

      if (isShapeTool(tool)) {
        const target = snapSketchPoint(current, at, hitRadius, gridStep);
        const step = shapeClick(tool, current, shapeClicks.current, target, hitRadius);
        shapeClicks.current = step.clicks;
        setPending(step.clicks.length === 0 ? [] : [...step.clicks]);
        if (step.message !== undefined) say(step.message);
        if (step.sketch !== null) commitSolved(step.sketch);
        return;
      }

      if (tool === 'trim') {
        commitDraft(trimAt(current, at, hitRadius));
        anchor.current = null;
        arcEnd.current = null;
        setPending([]);
        return;
      }

      if (tool === 'rectangle' || tool === 'center-rectangle') {
        const target = snapSketchPoint(current, at, hitRadius, gridStep);
        // The first click sets a corner; the second builds the shape and resets the tool.
        if (from === null) {
          anchor.current = { id: '', at: target, created: false };
          setPending([target, target]);
          return;
        }
        const next =
          tool === 'center-rectangle'
            ? centerRectangleAt(
                current,
                from.at,
                rectangleTarget(from.at, target, rectangleSize.current, true),
                rectangleSize.current.u !== '' || rectangleSize.current.v !== '' ? 0 : hitRadius,
              )
            : rectangleAt(
                current,
                from.at,
                rectangleTarget(from.at, target, rectangleSize.current, false),
                rectangleSize.current.u !== '' || rectangleSize.current.v !== '' ? 0 : hitRadius,
              );
        commitDraft(holdTypedDimensions(current, next, rectangleSize.current));
        anchor.current = null;
        typedRef.current = '';
        rectangleSize.current = { axis: 'u', u: '', v: '' };
        setTypedState('');
        setPending([]);
        return;
      }

      if (tool === 'circle') {
        if (from === null) {
          const target = snapSketchPoint(current, at, hitRadius, gridStep);
          const center = ensurePoint(current, target, hitRadius);
          commitDraft(center.sketch);
          anchor.current = { id: center.id, at: target, created: !center.joined };
          setPending([target]);
          return;
        }
        commitDraft(
          holdTypedDimensions(
            current,
            circleFromCenter(current, from.id, withTypedLength(from.at, snapToGrid(at, gridStep))),
            typedRef.current,
          ),
        );
        typedRef.current = '';
        setTypedState('');
        anchor.current = null;
        setPending([]);
        return;
      }

      if (tool === 'arc') {
        if (from === null) {
          const target = snapSketchPoint(current, at, hitRadius, gridStep);
          const start = ensurePoint(current, target, hitRadius);
          commitDraft(start.sketch);
          anchor.current = { id: start.id, at: target, created: !start.joined };
          arcEnd.current = null;
          setPending([target]);
          return;
        }
        if (arcEnd.current === null) {
          const target = snapSketchPoint(current, at, hitRadius, gridStep);
          const end = ensurePoint(current, target, hitRadius);
          commitDraft(end.sketch);
          arcEnd.current = { id: end.id, at: target, created: !end.joined };
          setPending([from.at, target]);
          return;
        }
        commitDraft(arcThrough(current, from.id, arcEnd.current.id, snapToGrid(at, gridStep)));
        anchor.current = null;
        arcEnd.current = null;
        setPending([]);
        return;
      }

      // Lines chain: each click ends one segment and starts the next, so a closed shape is drawn by
      // clicking around and back onto the first point, which snaps and closes the loop.
      //
      // A typed length sets the distance along the pointer's direction, and snapping is skipped for
      // that point so the exact typed value is kept.
      const aimed = from === null ? at : withTypedLength(from.at, at);
      const exact = from !== null && typedRef.current !== '' && aimed !== at;
      const target = exact ? aimed : snapSketchPoint(current, aimed, hitRadius, gridStep);
      const step = ensurePoint(current, target, exact ? 0 : hitRadius);
      commitDraft(
        from === null
          ? step.sketch
          : holdTypedDimensions(current, connect(step.sketch, from.id, step.id), typedRef.current),
      );
      // Only the chain's first point can be orphaned: later points are committed together with the
      // segment that reaches them.
      anchor.current = { id: step.id, at: target, created: from === null && !step.joined };
      setTyped('');
      setPending([]);
    },
    [
      tool,
      gridStep,
      commitDraft,
      commitSolved,
      say,
      select,
      withTypedLength,
      setTyped,
      snapSketchPoint,
    ],
  );

  const finish = useCallback(() => {
    if (surface === null) {
      say('Choose a plane to sketch on first.');
      return;
    }
    // Points `ensurePoint` added for an unfinished shape (e.g. Finish clicked mid-line) must not
    // reach the saved feature as stray vertices.
    const orphaned = new Set<SketchId>();
    if (anchor.current?.created === true) orphaned.add(anchor.current.id);
    if (arcEnd.current?.created === true) orphaned.add(arcEnd.current.id);
    // From the ref, not state: a click and Finish in the same tick would otherwise save the drawing
    // from before the click.
    const drawn = draftRef.current;
    const committed = orphaned.size > 0 ? deleteSketchPrimitives(drawn, orphaned) : drawn;
    if (committed.primitives.length === 0) {
      say('Nothing has been drawn yet.');
      return;
    }
    const reopened = editing.current;
    const params = {
      plane: surface.plane,
      sketch: committed,
      face: surface.face === null ? [] : [formatRef(surface.face)],
      ...surface.lean,
    };

    void run((session) =>
      // A reopened sketch is written back to its feature as a parameter change; appending a second
      // sketch would leave dependents on the old one. Merged over the existing params so inspector
      // settings (its offset) survive.
      reopened !== null && session.document.features.some((f) => f.id === reopened)
        ? session.apply({
            op: 'updateParams',
            id: reopened,
            params: {
              ...session.document.features.find((f) => f.id === reopened)?.params,
              ...params,
            },
          })
        : session.apply({
            op: 'addFeature',
            id: `sketch-${String(Date.now())}` as FeatureId,
            type: 'sketch',
            name: countedName(session.document, 'Sketch'),
            index: session.document.features.length,
            params,
          }),
    );

    anchor.current = null;
    arcEnd.current = null;
    editing.current = null;
    setPending([]);
    resetDraft(emptySketch());
    setToolState(null);
    setSelected([]);
  }, [surface, run, say, resetDraft]);

  /**
   * Reopens a committed sketch. The draft becomes the saved one, and `finish` writes back to the
   * same feature, so everything built on it rebuilds from the edited profile.
   */
  const resume = useCallback(
    (id: FeatureId, sketch: Sketch) => {
      editing.current = id;
      anchor.current = null;
      arcEnd.current = null;
      setPending([]);
      setSelected([]);
      setToolState(null);
      resetDraft(sketch);
    },
    [resetDraft],
  );

  placePending.current = click;
  const grip = useSketchGrip({
    draftRef,
    history,
    commitDraft,
    solver,
    isStandIn,
    select: setSelected,
  });

  return {
    tool,
    setTool,
    draft,
    selected,
    pending,
    snap,
    closed: isClosed(draft),
    click,
    deleteSelected,
    changeLineLength,
    changeCircleRadius,
    changeConstraintValue,
    applyEdit,
    freedom,
    defined,
    flags,
    move,
    cancelShape,
    undoLast,
    clear,
    finish,
    resume,
    typed,
    typeLength,
    constrainSelection,
    removeConstraint,
    changeAngle,
    drawingConstruction,
    setDrawingConstruction,
    toggleConstructionSelected,
    project,
    roundSelectedCorner,
    grip,
  };
}
