/** The viewport contract the application codes against. The implementation is in `viewport.ts`. */

/// <reference lib="dom" />

import type { PlaneBasis, PlaneLean, SketchPlane, SketchSurface, StableRef } from '@bezier/core';
import type { Bounds, EdgeSet, Mesh, MeshPiece } from '@bezier/kernel';
import type { Sketch, SketchId } from '@bezier/solver';
import type { EdgeFrame } from './frames.js';
import type { GridPlane } from './helpers.js';
import type { DetailSource } from './lod-body.js';
import type { PartMesh } from './part-preview.js';
import type { PickFilter, PickResult } from './picking.js';
import type { ImageLayer } from './reference-images.js';
import type { ReferenceMesh } from './reference-meshes.js';
import type { ResultField } from './result-overlay.js';
import type { CubeSide, ViewName } from './scene.js';
import type { PlaneName } from './sketch-planes.js';

/**
 * How a solid is drawn. `xray` is transparency without depth writes, so every face shows through,
 * not only the nearest.
 */
export type DisplayMode = 'shaded' | 'wireframe' | 'xray' | 'zebra' | 'curvature';

export interface ViewportOptions {
  canvas: HTMLCanvasElement;
  /** Device pixel ratio. Capped internally: a 5K display does not need all of it. */
  pixelRatio?: number;
}

/**
 * What the viewport displays. `faceRefs` names each face, indexed like `Mesh.triangleFaces`;
 * without it picking returns nothing.
 */
import type { NavigationPrefs } from './navigation.js';

export interface DisplayGeometry {
  mesh: Mesh;
  edges: EdgeSet | null;
  faceRefs: readonly (StableRef | null)[];
  /** Faces grouped by their actual B-Rep owning solid, including overlapping copies. */
  bodyRefs?: readonly (readonly StableRef[])[];
  /**
   * A colour per face, by the index `faceRefs` uses: 0xRRGGBB as the file gave it (sRGB), or
   * 0xFFFFFFFF for the default look. Absent when no face has one.
   */
  faceColours?: Uint32Array;
  /**
   * Source of finer or coarser meshes per part (`lod-body.ts`). Absent, the body is drawn as is.
   */
  detail?: DetailSource;
}

export type { EdgeFrame };

/** A sketch on show outside sketch mode. */
export interface ShownSketch {
  /** The sketch feature's id, handed back when one of its areas is clicked. */
  id: string;
  plane: PlaneBasis;
  sketch: Sketch;
  /** Areas a feature has already used, by key. */
  used: ReadonlySet<string>;
}

/** A closed area of a shown sketch, under the cursor. */
export interface SketchAreaHit {
  sketch: string;
  /** The area's key, as a feature stores it. */
  area: string;
  /** Where the cursor met the plane, in the plane's own coordinates. */
  at: { u: number; v: number };
  plane: PlaneBasis;
}

export interface Viewport {
  /** Match the WebGL clear and its grid to the surrounding application theme. */
  setAppearance(background: string, gridMinor: string, gridMajor: string): void;
  setGeometry(geometry: DisplayGeometry | null): void;
  /**
   * Draws a rebuilt part (the solid a face pull is dragging) in place of the faces `replaces`
   * names. Null, or the next `setGeometry`, removes it.
   */
  showPartPreview(part: PartMesh | null, replaces?: readonly StableRef[]): void;
  /**
   * Draws the faces `replaces` names moved by `matrix` (column-major), for dragging a body without
   * the kernel. With `copy` the original stays. Null, or the next `setGeometry`, restores the
   * model.
   */
  showMovedPreview(
    replaces: readonly StableRef[],
    matrix: readonly number[] | null,
    copy?: boolean,
  ): void;
  /** How the solid is drawn. */
  setDisplayMode(mode: DisplayMode): void;
  /** Whether the extracted edges are drawn over the solid. */
  setEdgesVisible(visible: boolean): void;
  setGridVisible(visible: boolean): void;
  setGridPlane(plane: GridPlane): void;
  /** The one colour for everything picked: faces, edges, bodies and sketch lines, `0xRRGGBB`. */
  setSelectionColour(hex: number): void;
  setAxesVisible(visible: boolean): void;
  /** The lens angle; with `parallel`, a true parallel projection however the view turns. */
  setFieldOfView(degrees: number, parallel?: boolean): void;
  /**
   * Switches between perspective and parallel projection. `setView` sets this already (axis views
   * are parallel); use it only to drive the projection directly.
   */
  setOrthographic(on: boolean): void;
  /** Whether the view is currently a true parallel projection. */
  isOrthographic(): boolean;
  /** Cut along +Z at this height, or stop cutting with null. */
  setSection(at: number | null): void;
  /** Square up to a named view. `animate` glides there instead of cutting. */
  /** A file dragged over the view at this point (CSS pixels), or null; drives the cloth effect. */
  pressFabric(point: { x: number; y: number } | null): void;
  /** A model still being imported, shown by its outline; null when it has arrived. */
  showImportPreview(outline: { edges: EdgeSet; box: Bounds } | null, colour?: string): void;
  /** Parts of a model still being meshed, shown until the model arrives. */
  showImportPiece(piece: MeshPiece): void;
  /** Whether a point on screen falls in the space a model being imported will take. */
  hitsImportPreview(x: number, y: number): boolean;
  setView(view: ViewName, animate?: boolean): void;
  /**
   * Squares the view up to the face at a canvas point and frames it. False when no face is there.
   */
  squareAt(screenX: number, screenY: number, animate?: boolean): boolean;
  /** The camera orientation as a 16-number matrix for a CSS `matrix3d`: drives the view cube. */
  viewCubeMatrix(): readonly number[];
  /** Orbit the camera by hand, in radians, for dragging the view cube. */
  orbit(deltaAzimuth: number, deltaPolar: number): void;
  /** A quarter turn about the up axis that leaves a parallel view parallel. */
  spin(deltaAzimuth: number, animate?: boolean): void;
  /** The datum plane implied by the last exact axis view, or null after a free turn. */
  sketchPlaneForView(): ViewPlane | null;
  /** A PNG of the frame, optionally at a multiple of the canvas and without a background. */
  capture(options?: { scale?: number; transparent?: boolean }): Promise<Blob | null>;
  setHighlighted(refs: readonly StableRef[]): void;
  setSelected(refs: readonly StableRef[]): void;
  /** Show or hide the datum planes used to choose where a sketch lives. */
  setSketchPlanesVisible(visible: boolean): void;
  /** Brighten the datum plane at this pixel, or clear the hover when it misses. */
  hoverSketchPlane(screenX: number, screenY: number): PlaneName | null;
  /** Reveal the other half of the world axis under the pointer, if any. */
  hoverAxis(screenX: number, screenY: number): number | null;
  /** Re-applies navigation settings after the user changed them. */
  setNavigation(prefs: NavigationPrefs): void;
  /** Told which device automatic detection reads scrolling as, when that changes. */
  onScrollDevice(listener: ((device: 'mouse' | 'trackpad') => void) | null): void;
  /**
   * The faces inside a screen rectangle: wholly inside for a window (dragged left to right),
   * touching it for a crossing (dragged right to left).
   */
  facesInRect(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    mode: 'window' | 'crossing',
  ): readonly StableRef[];
  /** Look from between cube sides: two for an edge view, three for a corner. */
  setViewBetween(sides: readonly CubeSide[], animate?: boolean): void;
  /** Whether a press belongs to navigation under the current mapping, not to selection. */
  navigationClaims(event: {
    button: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  }): boolean;
  setSnapping(on: boolean): void;
  /** The corners and middle of the face under the pointer, in world millimetres. */
  snapPoints(): readonly { x: number; y: number; z: number }[];
  /** The snap point nearest the pointer, or null. */
  snapAt(screenX: number, screenY: number): { x: number; y: number; z: number } | null;
  /** Which datum plane is under this pixel, or null. */
  pickSketchPlane(screenX: number, screenY: number): PlaneName | null;
  /**
   * Where this pixel lands on the sketch plane, in plane millimetres. The plane is infinite, unlike
   * the quad shown while choosing it.
   */
  sketchPoint(
    screenX: number,
    screenY: number,
    plane: SketchSurface,
  ): { u: number; v: number } | null;
  /**
   * How far a screen radius reaches, in plane millimetres, for the current camera. One method so
   * snap previews and clicks use the same tolerance.
   */
  sketchHitRadius(screenX: number, screenY: number, plane: SketchSurface, pixels: number): number;
  /**
   * Draws a sketch on a plane. `pending` is the rubber band, in plane coordinates; null geometry
   * still shows the origin. A null plane removes the overlay.
   */
  setSketchDraft(
    plane: SketchSurface | null,
    sketch: Sketch | null,
    pending?: readonly { u: number; v: number }[],
    selected?: readonly SketchId[],
    /** Elements the constraints hold entirely, drawn as defined. */
    defined?: ReadonlySet<SketchId>,
  ): void;
  /**
   * The sketches on show besides the one being drawn, each on its own plane. Areas named in `used`
   * are not filled and cannot be picked.
   */
  setShownSketches(sketches: readonly ShownSketch[]): void;
  /** Draws shown sketch `id` moved by `by` (world millimetres) while dragged; null puts it back. */
  moveShownSketch(id: string | null, by: { x: number; y: number; z: number } | null): void;
  /** Imported meshes to draw for reference: see-through, never picked. */
  setReferenceMeshes(meshes: readonly ReferenceMesh[]): void;
  /** Pictures placed on a plane to model against: drawn, see-through, never picked by the model. */
  readonly images: ImageLayer;
  /** The closed sketch area under the cursor, the one nearest the eye, or null. */
  pickSketchArea(screenX: number, screenY: number): SketchAreaHit | null;
  /** What is under this position, in pixels relative to the canvas. */
  pick(screenX: number, screenY: number, filter?: PickFilter): PickResult | null;
  /** Every face under this position, nearest first, hidden ones included: "select through". */
  pickThrough(screenX: number, screenY: number): StableRef[];
  /** Where a world point lands on the canvas, in pixels, or null when behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  pointVisible(x: number, y: number, z: number): boolean;
  /** The centre of the model, where a move gizmo hangs, or null when empty. */
  contentCenter(): { x: number; y: number; z: number } | null;
  /** Current camera position in world space, exposed without allocating per frame. */
  cameraPosition(): Readonly<{ x: number; y: number; z: number }>;
  /** The camera as a view that can be saved and gone back to (audit F-034). */
  cameraView(): CameraView;
  showCameraView(view: CameraView): void;
  /**
   * World millimetres per screen pixel at the given distance (ignored for an orthographic camera),
   * for converting gizmo drags to world distances.
   */
  worldPerPixelAt(distance: number): number;
  /**
   * A picked edge's local frame, or null. Pass `anchor` (the hit point) to get the tangent nearest
   * the click.
   */
  edgeFrame(ref: StableRef, anchor?: { x: number; y: number; z: number }): EdgeFrame | null;
  /** The centroid of a face's vertices, for anchoring the extrude gizmo on the face. */
  faceCentroid(ref: StableRef): { x: number; y: number; z: number } | null;
  /** Outward normal of the selected planar face, in world coordinates. */
  faceNormal(ref: StableRef): { x: number; y: number; z: number } | null;
  /**
   * Draws simulation results over the part (sampled at the display vertices), or null to remove
   * them. Picking still uses the model. New geometry drops the results.
   */
  setResultField(field: ResultField | null): void;
  /** Scale the drawn displacement: 0 is undeformed, 1 is true scale. */
  setResultDeform(scale: number): void;
  /** Scalar under the pointer, on the displayed (possibly deformed) result mesh. */
  sampleResult(screenX: number, screenY: number): number | null;
  /** Frame the whole model, or just `box` (the picked parts) when given. */
  zoomToFit(box?: Bounds): void;
  resize(width: number, height: number): void;
  /**
   * Recent frame costs in milliseconds, public so ADR 0007 budgets can be checked from outside.
   * `resetFrameTimes` starts a clean measurement.
   */
  frameTimes(): readonly number[];
  resetFrameTimes(): void;
  dispose(): void;
}

/** The origin plane a sketch takes from the view, leaning to face it between two sides. */
export interface ViewPlane {
  plane: SketchPlane;
  lean: PlaneLean;
}

/** A camera to go back to: where it stands, what it looks at, and how it projects. */
export interface CameraView {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  parallel: boolean;
  zoom: number;
}
