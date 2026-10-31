/**
 * The React side of the viewport: just a canvas. The render loop never touches React (ADR 0007), so
 * this creates the imperative viewport once and pushes geometry and selection into it when they
 * change. Hover is written straight into the scene, not React state.
 */

import type { BodySummary, SketchSurface, StableRef } from '@bezier/core';
import {
  type CameraView,
  type CubeSide,
  createViewport,
  type DisplayGeometry,
  type DisplayMode,
  type EdgeFrame,
  type ImageLayer,
  type NavigationPrefs,
  type PartMesh,
  type PlaneName,
  type ReferenceImage,
  type ReferenceMesh,
  type Viewport as Scene,
  type ShownSketch,
  type SketchAreaHit,
  type ViewName,
  type ViewPlane,
} from '@bezier/renderer';
import type { Sketch, SketchId } from '@bezier/solver';
import { SNAP_DISTANCE } from '@bezier/ui';
import { type RefObject, useEffect, useRef } from 'react';
import { PickThrough } from './PickThrough.js';
import { SketchConstraintMarks } from './SketchConstraintMarks.js';
import { SketchDimensions } from './SketchDimensions.js';
import { pointerOverCanvas } from './square-view.js';
import { boundsOf } from './use-bodies.js';
import { useDragFabric } from './use-drag-fabric.js';
import { useImportPreview } from './use-import-preview.js';
import type { SketchGrabber } from './use-sketch-grip.js';

/** How long after a double-click another press at the same place still belongs to it. */
const MULTI_CLICK_MS = 450;
/** Shared empty lists, so the effects below are not re-run. */
const NO_REFERENCES: readonly ReferenceMesh[] = [];
const NO_IMAGES: readonly ReferenceImage[] = [];
const NO_SKETCHES: readonly ShownSketch[] = [];

/** Past this many pixels a Shift-press is a rectangle, not a click. */
const MARQUEE_THRESHOLD_PX = 4;

/** Shows the selection rectangle, or hides it with null. Written straight to the element. */
function drawMarquee(
  node: HTMLDivElement | null,
  area: { x0: number; y0: number; x1: number; y1: number; moved: boolean } | null,
  box: DOMRect,
): void {
  if (node === null) return;
  if (area === null || !area.moved) {
    node.style.display = 'none';
    return;
  }
  node.style.display = 'block';
  node.style.left = `${box.left + Math.min(area.x0, area.x1)}px`;
  node.style.top = `${box.top + Math.min(area.y0, area.y1)}px`;
  node.style.width = `${Math.abs(area.x1 - area.x0)}px`;
  node.style.height = `${Math.abs(area.y1 - area.y0)}px`;
  node.dataset.mode = area.x1 >= area.x0 ? 'window' : 'crossing';
}

/**
 * The name of what the pointer is on, beside it. Positioned during render, since every pointer move
 * with a tool active renders anyway for the rubber band.
 */
function SnapHint({ canvas, name }: { canvas: HTMLCanvasElement | null; name: string }) {
  const box = canvas?.getBoundingClientRect();
  if (box === undefined) return null;
  return (
    <div
      className="sketch-snap"
      role="status"
      style={{ left: box.left + pointerOverCanvas.x + 14, top: box.top + pointerOverCanvas.y + 14 }}
    >
      {name}
    </div>
  );
}

/** Pointer tolerance for sketch hits, in pixels; converted to plane millimetres per click. */
const SKETCH_HIT_RADIUS_PX = 12;

/**
 * The snap tolerance in plane millimetres at the pointer. Never below `SNAP_DISTANCE`: zoomed far
 * in, twelve pixels can be a fraction of a millimetre, making loops hard to close.
 */
function sketchHitRadius(scene: Scene, x: number, y: number, plane: SketchSurface): number {
  return Math.max(SNAP_DISTANCE, scene.sketchHitRadius(x, y, plane, SKETCH_HIT_RADIUS_PX));
}

/**
 * What the app may ask of the viewport. A narrow surface rather than the whole `Viewport`: the
 * settings panels drive display state imperatively and everything else goes through props.
 */
export interface ViewportHandle {
  sketchPoint(x: number, y: number, plane: SketchSurface): { u: number; v: number } | null;
  setDisplayMode(mode: DisplayMode): void;
  setEdgesVisible(visible: boolean): void;
  setGridVisible(visible: boolean): void;
  setGridPlane(plane: 'XY' | 'YZ' | 'XZ'): void;
  setAxesVisible(visible: boolean): void;
  setFieldOfView(degrees: number, parallel?: boolean): void;
  /** Switches between perspective and orthographic projection. */
  setOrthographic(on: boolean): void;
  /** Whether the view is orthographic. */
  isOrthographic(): boolean;
  setSection(at: number | null): void;
  /** Squares up to a named view. `animate` glides instead of jumping. */
  setView(view: ViewName, animate?: boolean): void;
  /** Squares the view to the face at a canvas point and returns it; null when there is none. */
  squareAt(screenX: number, screenY: number, animate?: boolean): StableRef | null;
  /** Views from between cube sides: two for an edge view, three for a corner. */
  setViewBetween(sides: readonly CubeSide[], animate?: boolean): void;
  setSketchPlanesVisible(visible: boolean): void;
  viewCubeMatrix(): readonly number[];
  orbit(deltaAzimuth: number, deltaPolar: number): void;
  /** A quarter turn that keeps an orthographic view orthographic. */
  spin(deltaAzimuth: number, animate?: boolean): void;
  /** The datum plane implied by the last exact axis view. */
  sketchPlaneForView(): ViewPlane | null;
  /** The camera as a saveable view, and back. */
  cameraView(): CameraView;
  showCameraView(view: CameraView): void;
  /** Where a world point lands on the canvas, for anchoring an on-canvas gizmo. */
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  pointVisible(x: number, y: number, z: number): boolean;
  /** The model's centre, where a move gizmo hangs, or null when empty. */
  contentCenter(): { x: number; y: number; z: number } | null;
  /** Current camera position, reused by the move gizmo without a frame allocation. */
  cameraPosition(): Readonly<{ x: number; y: number; z: number }>;
  /** World millimetres per screen pixel at the given distance from the camera. */
  worldPerPixelAt(distance: number): number;
  /** The picked edge's tangent and outward directions, for orienting its gizmo. */
  edgeFrame(ref: StableRef, anchor?: { x: number; y: number; z: number }): EdgeFrame | null;
  /** A part drawn in place of `replaces` while it is dragged (a face pull). */
  showPartPreview(part: PartMesh | null, replaces?: readonly StableRef[]): void;
  /** Draws a shown sketch offset by `by` while it is dragged; null resets it. */
  moveShownSketch(id: string | null, by: { x: number; y: number; z: number } | null): void;
  /** Draws faces transformed by a column-major matrix while a body is dragged; null resets them. */
  showMovedPreview(
    replaces: readonly StableRef[],
    matrix: readonly number[] | null,
    copy?: boolean,
  ): void;
  /** Reference images: previewed while a handle is dragged, and hit-tested by pixel. */
  readonly images: ImageLayer;
  /** The centroid of a face, averaged over its vertices, for anchoring a gizmo on the surface. */
  faceCentroid(ref: StableRef): { x: number; y: number; z: number } | null;
  faceNormal(ref: StableRef): { x: number; y: number; z: number } | null;
  /** A PNG of the frame, optionally scaled and without a background. */
  capture(options?: { scale?: number; transparent?: boolean }): Promise<Blob | null>;
  /** Sizes the drawing buffer in CSS pixels (the stage's observer calls this itself). */
  resize(width: number, height: number): void;
  zoomToFit(): void;
  /** Re-applies navigation preferences after the user changed them. */
  setNavigation(prefs: NavigationPrefs): void;
  /** Notified when automatic detection decides scrolling is a mouse or a trackpad. */
  onScrollDevice(listener: ((device: 'mouse' | 'trackpad') => void) | null): void;
  /** Turns measurement snap points on or off. */
  setSnapping(on: boolean): void;
  /** Corners and middle of the face under the pointer, in world millimetres. */
  snapPoints(): readonly { x: number; y: number; z: number }[];
  /** The snap point nearest the pointer, or null. */
  snapAt(screenX: number, screenY: number): { x: number; y: number; z: number } | null;
  /** Draws simulation results over the part; null restores the part. */
  setResultField(field: Parameters<Scene['setResultField']>[0]): void;
  /** Scales the displayed displacement: 0 is undeformed, 1 is true scale. */
  setResultDeform(scale: number): void;
  /** Scalar under the pointer, on the displayed (possibly deformed) result mesh. */
  sampleResult(screenX: number, screenY: number): number | null;
}

export interface ViewportProps {
  documentId?: string;
  /** The camera view when a project opens. Thumbnails are always shot from the corner. */
  openView?: 'top' | 'angled';
  measuring?: boolean;
  geometry: DisplayGeometry | null;
  selected: readonly StableRef[];
  /**
   * The clicked reference, or null for empty space. `additive` is true when a modifier was held:
   * toggle this in the selection rather than replace it.
   */
  onPick: (
    ref: StableRef | null,
    additive: boolean,
    point: { x: number; y: number; z: number } | null,
  ) => void;
  /** A double-click: selects the whole body under the cursor (null if it missed the model). */
  onSelectBody: (ref: StableRef | null, additive: boolean) => void;
  /** The bodies, for listing the ones under a right-click (`PickThrough.tsx`). */
  bodies?: readonly BodySummary[] | undefined;
  /** What to pick: faces for most things, edges for a fillet. */
  picking: 'face' | 'edge' | 'any';
  /**
   * When set, clicks choose a datum plane rather than geometry (sketch mode before a plane is
   * chosen). `onPickPlane` receives it; hover highlights the plane under the cursor.
   */
  planePicking?: boolean;
  onPickPlane?: (plane: PlaneName) => void;
  /** While choosing a plane, a click on a body face: sketch on that face. */
  onPickFace?: (face: StableRef) => void;
  /**
   * The sketch plane and its draft, set together. While `sketchTool` is set, clicks land on the
   * plane and never reach the picker.
   */
  sketchPlane?: SketchSurface | null;
  sketchDraft?: Sketch | null;
  /** The finished sketches shown, each on its own plane. */
  shownSketches?: readonly ShownSketch[];
  /** Imported meshes, drawn for reference. */
  references?: readonly ReferenceMesh[];
  /** Reference images placed on planes. */
  images?: readonly ReferenceImage[];
  /** A click on a reference image (its id) or on nothing (null). */
  onImagePick?: (id: string | null) => void;
  /**
   * A click inside a closed area of a shown sketch. `additive` when a modifier was held, to add the
   * area to the current offer.
   */
  onSketchAreaClick?: (hit: SketchAreaHit, additive: boolean) => void;
  /** The faces inside a Shift-drag rectangle. */
  onAreaSelect?: (faces: readonly StableRef[], additive: boolean) => void;
  sketchSelected?: readonly SketchId[];
  /** Draft elements fully constrained. */
  sketchDefined?: ReadonlySet<SketchId>;
  /** Constraints to mark as conflicting or redundant. */
  sketchFlags?: ReadonlyMap<SketchId, 'conflict' | 'redundant'>;
  sketchPending?: readonly { u: number; v: number }[];
  /** What the point under the pointer would snap to, shown beside it. */
  sketchSnap?: string | null;
  sketchTool?: string | null;
  onSketchClick?: (at: { u: number; v: number }, additive: boolean, hitRadius: number) => void;
  onSketchMove?: (at: { u: number; v: number } | null, hitRadius: number) => void;
  /** Grabbing and moving drawn geometry with no tool active. */
  sketchGrip?: SketchGrabber;
  onSketchLineLength?: (id: SketchId, length: number) => void;
  onSketchCircleRadius?: (id: SketchId, radius: number) => void;
  onSketchConstraintValue?: (id: SketchId, value: number) => void;
  /** A click on a constraint's mark: remove that constraint. */
  onSketchConstraintRemove?: (id: SketchId) => void;
  onSketchAngleChange?: (id: SketchId, degrees: number) => void;
  /** Bump this to re-frame the model. */
  fitSignal: number;
  /** Filled in once the scene exists, so panels can drive it. */
  handleRef?: RefObject<ViewportHandle | null>;
}

export function Viewport({
  documentId = '',
  openView = 'top',
  measuring = false,
  geometry,
  selected,
  onPick,
  onSelectBody,
  bodies,
  picking,
  planePicking = false,
  onPickPlane,
  onPickFace,
  sketchPlane = null,
  sketchDraft = null,
  shownSketches = NO_SKETCHES,
  references = NO_REFERENCES,
  images = NO_IMAGES,
  onImagePick,
  onSketchAreaClick,
  onAreaSelect,
  sketchSelected = [],
  sketchDefined,
  sketchFlags,
  sketchPending = [],
  sketchSnap = null,
  sketchTool = null,
  onSketchClick,
  onSketchMove,
  sketchGrip,
  onSketchLineLength,
  onSketchCircleRadius,
  onSketchConstraintValue,
  onSketchConstraintRemove,
  onSketchAngleChange,
  fitSignal,
  handleRef,
}: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  // Read when framing is requested, which only the signal triggers.
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useDragFabric(canvasRef, sceneRef);
  useImportPreview(canvasRef, sceneRef);
  /** Whether the camera has been placed for the current model. */
  const framedRef = useRef(false);
  /** Time and position of the last double-click, for the presses right after it. */
  const lastDouble = useRef({ at: 0, x: 0, y: 0 });
  const framedDocumentRef = useRef(documentId);
  /** The project the opening view was last set for; null until the first one. */
  const viewedDocumentRef = useRef<string | null>(null);
  // Stable handlers read these refs so mode changes do not rebuild listeners.
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const planePickingRef = useRef(planePicking);
  planePickingRef.current = planePicking;
  const onPickPlaneRef = useRef(onPickPlane);
  onPickPlaneRef.current = onPickPlane;
  const sketchPlaneRef = useRef(sketchPlane);
  sketchPlaneRef.current = sketchPlane;
  const sketchToolRef = useRef(sketchTool);
  sketchToolRef.current = sketchTool;
  const onSketchClickRef = useRef(onSketchClick);
  onSketchClickRef.current = onSketchClick;
  const onSketchMoveRef = useRef(onSketchMove);
  onSketchMoveRef.current = onSketchMove;
  const sketchGripRef = useRef(sketchGrip);
  sketchGripRef.current = sketchGrip;
  /** A drawn line, curve or point held by the pointer since the press. */
  const sketchHeld = useRef(false);
  const onPickFaceRef = useRef(onPickFace);
  onPickFaceRef.current = onPickFace;
  const onSketchAreaClickRef = useRef(onSketchAreaClick);
  onSketchAreaClickRef.current = onSketchAreaClick;
  const onImagePickRef = useRef(onImagePick);
  onImagePickRef.current = onImagePick;
  const onAreaSelectRef = useRef(onAreaSelect);
  onAreaSelectRef.current = onAreaSelect;
  /** A Shift-drag in progress, in canvas pixels. */
  const marquee = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    moved: boolean;
    additive: boolean;
  } | null>(null);
  const marqueeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sceneRef.current?.setSketchPlanesVisible(planePicking);
  }, [planePicking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const scene = createViewport({ canvas });
    sceneRef.current = scene;
    if (handleRef !== undefined) handleRef.current = scene;
    // Exposed to browser tests (`localStorage['bezier.e2e']`), which set an exact camera pose to
    // compare screenshots.
    try {
      if (window.localStorage.getItem('bezier.e2e') === '1')
        (window as { __bezierViewport?: unknown }).__bezierViewport = scene;
    } catch {
      // Storage unavailable: no test hook.
    }

    const applyAppearance = () => {
      const style = window.getComputedStyle(canvas);
      const background = style.getPropertyValue('--canvas-top').trim();
      const minor = style.getPropertyValue('--grid-minor').trim();
      const major = style.getPropertyValue('--grid-major').trim();
      scene.setAppearance(background, minor, major);
      // The selection colour is a preference written to `--select` (use-prefs.ts); the observer
      // below sees that as a style change on the root.
      const select = /^#([0-9a-f]{6})$/i.exec(style.getPropertyValue('--select').trim());
      if (select?.[1] !== undefined) scene.setSelectionColour(Number.parseInt(select[1], 16));
    };
    applyAppearance();
    const theme = new MutationObserver(applyAppearance);
    theme.observe(window.document.documentElement, { attributes: true });
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)');
    systemTheme.addEventListener('change', applyAppearance);

    const resize = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box !== undefined) scene.resize(box.width, box.height);
    });
    resize.observe(canvas);

    // When the browser runs low on GPU memory it drops the WebGL context and later restores it.
    // three.js re-uploads everything, but the view only draws when something changed, so the model
    // stayed blank until reopened. Resizing to the current size marks the frame dirty.
    const restored = () => scene.resize(canvas.clientWidth, canvas.clientHeight);
    canvas.addEventListener('webglcontextrestored', restored);

    return () => {
      canvas.removeEventListener('webglcontextrestored', restored);
      theme.disconnect();
      systemTheme.removeEventListener('change', applyAppearance);
      resize.disconnect();
      scene.dispose();
      sceneRef.current = null;
      if (handleRef !== undefined) handleRef.current = null;
    };
  }, [handleRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene === null) return;
    // Open each project with the chosen view, not the corner view the previous project's thumbnail
    // was shot from.
    if (viewedDocumentRef.current !== documentId) {
      viewedDocumentRef.current = documentId;
      scene.setView(openView === 'top' ? 'top' : 'default', false);
    }
    if (framedDocumentRef.current !== documentId) {
      framedDocumentRef.current = documentId;
      framedRef.current = false;
      // A previous project's sketch must not enlarge the new project's fit bounds.
      scene.setSketchDraft(null, null, [], []);
    }
    scene.setGeometry(geometry);

    // Frame only when a model first appears. Re-framing on every rebuild would discard the user's
    // zoom and orbit whenever a parameter changes.
    if (geometry !== null && !framedRef.current) {
      framedRef.current = true;
      scene.zoomToFit();
    }
    if (geometry === null) framedRef.current = false;
  }, [geometry, documentId, openView]);

  useEffect(() => {
    sceneRef.current?.setSelected(selected);
  }, [selected]);

  // A visible drawing was already framed when it was made. When its first solid appears, keep that
  // framing instead of zooming the solid to fill the viewport.
  const drawing = (sketchDraft?.primitives.length ?? 0) > 0 || shownSketches.length > 0;
  useEffect(() => {
    if (geometry === null) framedRef.current = drawing;
  }, [geometry, drawing]);

  // The overlay follows the draft, not the frame loop; a sketch changes only when the user draws.
  useEffect(() => {
    sceneRef.current?.setSketchDraft(
      sketchPlane,
      sketchDraft,
      sketchPending,
      sketchSelected,
      sketchDefined,
    );
  }, [sketchPlane, sketchDraft, sketchPending, sketchSelected, sketchDefined]);

  useEffect(() => {
    sceneRef.current?.setShownSketches(shownSketches);
  }, [shownSketches]);

  useEffect(() => {
    sceneRef.current?.setReferenceMeshes(references);
  }, [references]);

  useEffect(() => {
    sceneRef.current?.images.set(images);
  }, [images]);

  useEffect(() => {
    // Zero is the initial value, before any request. With something picked, frame the pick: a 1 mm
    // part next to a metre-long one was lost when framing the whole.
    if (fitSignal === 0) return;
    const picked = boundsOf(geometryRef.current, selectedRef.current);
    sceneRef.current?.zoomToFit(
      picked === null
        ? undefined
        : {
            min: { x: picked.min[0], y: picked.min[1], z: picked.min[2] },
            max: { x: picked.max[0], y: picked.max[1], z: picked.max[2] },
          },
    );
  }, [fitSignal]);

  return (
    <>
      <canvas
        className="viewport"
        onDoubleClick={(event) => {
          if (measuring) return;
          const scene = sceneRef.current;
          if (scene === null) return;
          const box = event.currentTarget.getBoundingClientRect();
          // A body is a solid, so a double-click resolves against faces even in edge-picking mode;
          // otherwise selecting a body would depend on missing the edges by a few pixels.
          const hit = scene.pick(event.clientX - box.left, event.clientY - box.top, 'face');
          lastDouble.current = { at: performance.now(), x: event.clientX, y: event.clientY };
          onSelectBody(hit?.ref ?? null, event.shiftKey || event.metaKey || event.ctrlKey);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const scene = sceneRef.current;
          if (scene === null) return;
          // A preset may navigate with the left button plus keys (Alias); that press belongs to
          // the camera.
          if (scene.navigationClaims(event)) return;
          // A third or fourth press right after a double-click continues the gesture (a slip, or a
          // fast second double-click the browser does not report). Keep the body it selected
          // instead of replacing it with the face under the pointer.
          const since = performance.now() - lastDouble.current.at;
          if (
            since < MULTI_CLICK_MS &&
            Math.hypot(event.clientX - lastDouble.current.x, event.clientY - lastDouble.current.y) <
              8
          ) {
            lastDouble.current.at = performance.now();
            return;
          }
          const box = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - box.left;
          const y = event.clientY - box.top;

          if (measuring) {
            const hit = scene.pick(x, y, 'face');
            scene.setHighlighted(hit === null ? [] : [hit.ref]);
            onPick(hit?.ref ?? null, false, scene.snapAt(x, y) ?? hit?.point ?? null);
            return;
          }

          // Choosing a plane is exclusive, so a click on a datum plane does not also select the
          // face behind it.
          if (planePickingRef.current) {
            const plane = scene.pickSketchPlane(x, y);
            if (plane !== null) {
              onPickPlaneRef.current?.(plane);
              return;
            }
            // No datum plane under the pointer: try a body face.
            const face = scene.pick(x, y, 'face');
            if (face?.ref.kind === 'face') onPickFaceRef.current?.(face.ref);
            return;
          }

          // With a tool active the click is a drawn point, not a selection. Checked before picking
          // so a click over the body still draws on the plane.
          const drawingOn = sketchPlaneRef.current;
          if (drawingOn !== null) {
            const at = scene.sketchPoint(x, y, drawingOn);
            if (at !== null) {
              const radius = sketchHitRadius(scene, x, y, drawingOn);
              onSketchClickRef.current?.(at, event.shiftKey || event.metaKey, radius);
              // With no tool active, the press that selects a line also grabs it, so a drag moves
              // it.
              if (sketchToolRef.current === null && sketchGripRef.current?.start(at, radius)) {
                sketchHeld.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
              }
            }
            return;
          }

          const hit = scene.pick(x, y, pickingRef.current);
          const sketchArea =
            onSketchAreaClickRef.current === undefined ? null : scene.pickSketchArea(x, y);
          // A reference image under the pointer with nothing in front: select it, like a body, and
          // show its handles and panel.
          if (hit === null && sketchArea === null && onImagePickRef.current !== undefined) {
            const picture = scene.images.pick(x, y);
            if (picture !== null) {
              onImagePickRef.current(picture);
              return;
            }
            // Clicked away from every image: end editing the current one.
            onImagePickRef.current(null);
          }
          // Empty-space drags select without modifiers; held modifiers add instead of replacing.
          if (
            event.pointerType !== 'touch' &&
            onAreaSelectRef.current !== undefined &&
            (event.shiftKey || (hit === null && sketchArea === null))
          ) {
            marquee.current = {
              x0: x,
              y0: y,
              x1: x,
              y1: y,
              moved: false,
              additive: event.shiftKey || event.metaKey || event.ctrlKey,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }

          // A closed sketch area is a pick target even without B-Rep triangles. Resolved before the
          // solid picker, so clicking the fill offers Extrude directly.
          if (onSketchAreaClickRef.current !== undefined) {
            const area = sketchArea;
            if (area !== null) {
              onSketchAreaClickRef.current(area, event.shiftKey || event.metaKey);
              return;
            }
          }

          // A snap point under the pointer wins over the raw ray hit, so aiming at a corner gives
          // 20 and not 19.97.
          const snapped = scene.snapAt(x, y);
          onPick(hit?.ref ?? null, event.shiftKey || event.metaKey, snapped ?? hit?.point ?? null);
        }}
        onPointerMove={(event) => {
          const scene = sceneRef.current;
          if (scene === null) return;
          const box = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - box.left;
          const y = event.clientY - box.top;
          pointerOverCanvas.x = x;
          pointerOverCanvas.y = y;
          pointerOverCanvas.over = true;

          if (sketchHeld.current && sketchPlaneRef.current !== null) {
            const at = scene.sketchPoint(x, y, sketchPlaneRef.current);
            if (at !== null) sketchGripRef.current?.move(at);
            return;
          }

          const area = marquee.current;
          if (area !== null) {
            area.x1 = x;
            area.y1 = y;
            area.moved ||= Math.hypot(x - area.x0, y - area.y0) > MARQUEE_THRESHOLD_PX;
            drawMarquee(marqueeRef.current, area, box);
            return;
          }

          if (planePickingRef.current) {
            const plane = scene.hoverSketchPlane(x, y);
            // Highlight a sketchable face when no plane is under the pointer.
            const face = plane === null ? scene.pick(x, y, 'face') : null;
            scene.setHighlighted(face === null ? [] : [face.ref]);
            return;
          }

          // The rubber band goes through React, since the shape in progress is tool state, but only
          // while a tool is active, so ordinary hover stays free.
          const drawingOn = sketchPlaneRef.current;
          if (sketchToolRef.current !== null && drawingOn !== null) {
            // Use the same tolerance as the click, or the preview and the commit snap differently.
            onSketchMoveRef.current?.(
              scene.sketchPoint(x, y, drawingOn),
              sketchHitRadius(scene, x, y, drawingOn),
            );
            return;
          }

          const hit = scene.pick(x, y, measuring ? 'face' : pickingRef.current);
          // Straight into the scene; no state, no render.
          scene.setHighlighted(hit === null ? [] : [hit.ref]);
          // An axis is drawn as a ray from the origin. Hovering it shows the negative half too, so
          // distances the other way can be read. Only when not over a solid.
          scene.hoverAxis(hit === null ? x : -1, y);
        }}
        onPointerUp={(event) => {
          if (sketchHeld.current) {
            sketchHeld.current = false;
            sketchGripRef.current?.end();
            return;
          }
          const area = marquee.current;
          const scene = sceneRef.current;
          if (area === null || scene === null) return;
          marquee.current = null;
          drawMarquee(marqueeRef.current, null, event.currentTarget.getBoundingClientRect());
          if (area.moved) {
            // Left to right selects what is wholly inside; right to left, whatever the rectangle
            // touches.
            const mode = area.x1 >= area.x0 ? 'window' : 'crossing';
            onAreaSelectRef.current?.(
              scene.facesInRect(area.x0, area.y0, area.x1, area.y1, mode),
              area.additive,
            );
            return;
          }
          // Not a drag after all: a Shift-click. On a sketch area it adds the area to the extrude
          // offer; elsewhere it adds to the selection.
          if (onSketchAreaClickRef.current !== undefined) {
            const sketchArea = scene.pickSketchArea(area.x0, area.y0);
            if (sketchArea !== null) {
              onSketchAreaClickRef.current(sketchArea, area.additive);
              return;
            }
          }
          const hit = scene.pick(area.x0, area.y0, pickingRef.current);
          onPick(
            hit?.ref ?? null,
            area.additive,
            scene.snapAt(area.x0, area.y0) ?? hit?.point ?? null,
          );
        }}
        onPointerLeave={() => {
          pointerOverCanvas.over = false;
        }}
        onPointerCancel={(event) => {
          if (sketchHeld.current) sketchGripRef.current?.end();
          sketchHeld.current = false;
          marquee.current = null;
          drawMarquee(marqueeRef.current, null, event.currentTarget.getBoundingClientRect());
        }}
        onLostPointerCapture={(event) => {
          if (sketchHeld.current) sketchGripRef.current?.end();
          sketchHeld.current = false;
          marquee.current = null;
          drawMarquee(marqueeRef.current, null, event.currentTarget.getBoundingClientRect());
        }}
        ref={canvasRef}
      />
      <div aria-hidden="true" className="viewport-marquee" ref={marqueeRef} />
      {sketchSnap !== null && sketchTool !== null && pointerOverCanvas.over && (
        <SnapHint canvas={canvasRef.current} name={sketchSnap} />
      )}
      {bodies !== undefined && !measuring && (
        <PickThrough
          bodies={bodies}
          canvasRef={canvasRef}
          onSelectBody={onSelectBody}
          sceneRef={sceneRef}
        />
      )}
      {/* Only while sketching: dimensions are the drawing tool's readout, not annotations, so a
          finished sketch does not keep them. */}
      {sketchPlane !== null && sketchDraft !== null && (
        <SketchDimensions
          handleRef={sceneRef}
          {...(onSketchLineLength !== undefined ? { onChange: onSketchLineLength } : {})}
          {...(onSketchCircleRadius !== undefined ? { onCircleChange: onSketchCircleRadius } : {})}
          {...(onSketchConstraintValue !== undefined
            ? { onConstraintChange: onSketchConstraintValue }
            : {})}
          pending={sketchPending}
          plane={sketchPlane}
          sketch={sketchDraft}
        />
      )}
      {sketchPlane !== null && sketchDraft !== null && onSketchConstraintRemove !== undefined && (
        <SketchConstraintMarks
          handleRef={sceneRef}
          {...(onSketchAngleChange !== undefined ? { onAngleChange: onSketchAngleChange } : {})}
          {...(onSketchConstraintValue !== undefined
            ? { onRatioChange: onSketchConstraintValue }
            : {})}
          onRemove={onSketchConstraintRemove}
          {...(sketchFlags !== undefined ? { flags: sketchFlags } : {})}
          plane={sketchPlane}
          sketch={sketchDraft}
        />
      )}
    </>
  );
}
