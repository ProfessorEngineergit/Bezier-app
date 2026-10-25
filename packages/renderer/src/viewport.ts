/**
 * The viewport implementation (`viewport-api.ts`), translating stable references and screen pixels
 * to the scene (`scene.ts`), picking (`bvh.ts`, `picking.ts`) and highlighting (`highlight.ts`).
 */

/// <reference lib="dom" />

import { formatRef, type SketchSurface, type StableRef, surfaceBasis } from '@bezier/core';
import type { Bounds, EdgeSet, MeshPiece } from '@bezier/kernel';
import type { Sketch, SketchId } from '@bezier/solver';
import { LineBasicMaterial, LineSegments, Matrix4, Mesh as ThreeMesh, Vector3 } from 'three';
import { facesInRect } from './area-select.js';
import { createBodyMaterial, surfaceAnalysis } from './body-material.js';
import { showView, viewOf } from './camera-view.js';
import { markCorner } from './corner-picking.js';
import { DatumLine } from './datum-line.js';
import { visibilityFor } from './display-mode.js';
import { buildEdgeGeometry } from './edges.js';
import {
  type EdgeFrame,
  edgeFrameBetween,
  faceBoundsByIndex,
  faceCentroidByIndex,
  faceNormalAt,
  faceNormalByIndex,
  type MeshFrames,
} from './frames.js';
import { axisUnderPointer } from './grid-lod.js';
import type { GridPlane } from './helpers.js';
import { BASE_COLOUR, Highlighter, OUTLINE_COLOUR } from './highlight.js';
import { ImportPreview } from './import-preview.js';
import { LodBody } from './lod-body.js';
import { buildGeometry, type FaceVertices, indexFaceVertices, linearColours } from './mesh.js';
import type { NavigationPrefs } from './navigation.js';
import { buildOffThread } from './off-thread.js';
import { Outliner } from './outline.js';
import { type PartMesh, PartPreview } from './part-preview.js';
import { Picker, type PickFilter, type PickResult } from './picking.js';
import { ImageLayer } from './reference-images.js';
import type { ReferenceMesh } from './reference-meshes.js';
import { type ResultField, ResultOverlay } from './result-overlay.js';
import type { CubeSide, ViewName, ViewportScene } from './scene.js';
import { buildSeams } from './seams.js';
import { SectionCaps } from './section-caps.js';
import { ShownSketches } from './shown-sketches.js';
import { setSketchSelectionColour } from './sketch-draw.js';
import type { PlaneName } from './sketch-planes.js';
import { ViewSnapshot } from './solid-lod.js';
import { planeBetween, planeSpun } from './view-plane.js';
import type {
  CameraView,
  DisplayGeometry,
  DisplayMode,
  ShownSketch,
  SketchAreaHit,
  ViewPlane,
  Viewport,
} from './viewport-api.js';
import { worldPerPixel } from './world-per-pixel.js';

/** How near an edge the cursor has to be, in pixels, to select it and not a face. */
const EDGE_TOLERANCE_PX = 6;

/** How near an axis the pointer must be to reveal its other half, in pixels. Tighter than edges. */
const AXIS_TOLERANCE_PX = 4;

/**
 * How near a snap point the pointer must be to land on it, in pixels. Generous, since it is drawn.
 */
const SNAP_TOLERANCE_PX = 12;

/** How far along an axis its direction is sampled, as a fraction of the eye's distance. */
const AXIS_PROBE = 0.25;

/** Reused by `project`, so anchoring a gizmo every frame allocates nothing. */
const scratchProject = new Vector3();
const scratchMove = new Matrix4();

/**
 * Above this many triangles a model is drawn more cheaply while moving (interaction-quality.ts).
 * Well above any hand-modelled part.
 */
const HEAVY_TRIANGLES = 1_000_000;

/**
 * Above this many triangles the picking tree and seams are built in a worker (2.5 s on the main
 * thread at four million). Below it they take milliseconds and are built here.
 */
const OFF_THREAD_TRIANGLES = 300_000;

/**
 * Read-only calls. Every other public method marks the picture out of date (see the constructor),
 * so a new method redraws by default. Picking is here because it runs on every pointer move.
 */
const QUERIES: ReadonlySet<string> = new Set([
  'pick',
  'pickThrough',
  'facesInRect',
  'pointVisible',
  'worldPerPixelAt',
  'edgeFrame',
  'contentCenter',
  'cameraPosition',
  'cameraView',
  'snapPoints',
  'sketchPoint',
  'sketchHitRadius',
  'pickSketchPlane',
  'pickSketchArea',
  'isOrthographic',
  'viewCubeMatrix',
  'sketchPlaneForView',
  'frameTimes',
  'resetFrameTimes',
  'hitsImportPreview',
  'dispose',
]);

export class ViewportImpl implements Viewport {
  readonly #scene: ViewportScene;
  readonly #picker = new Picker();
  readonly #highlighter = new Highlighter();
  /** Whether the pointer should be offered points to land on. */
  #snapping = false;
  #sectionZ: number | null = null;
  #snapFace = '';
  #snapPoints: readonly { x: number; y: number; z: number }[] = [];
  readonly #outline = new Outliner(OUTLINE_COLOUR);

  /** What the outline tracks: a picked edge holds it; otherwise it follows the pointer. */
  #hovered: StableRef | null = null;
  #chosen: readonly StableRef[] = [];
  /** The name currently drawn, so an unchanged hover costs nothing. */
  #outlined = '';

  readonly #datum = new DatumLine();
  readonly #surface = createBodyMaterial(this.#datum);
  readonly #lines = new LineBasicMaterial({ color: 0x0b0c0e });

  #body: ThreeMesh | null = null;
  /** The body drawn part by part, each as finely as the view asks (`lod-body.ts`). */
  #lod: LodBody | null = null;
  readonly #view = new ViewSnapshot();
  /** Counts geometry changes, so work finished for an older one is dropped. */
  #generation = 0;
  #wireframe: LineSegments | null = null;
  #mode: DisplayMode = 'shaded';
  #edgesVisible = true;
  #faces: FaceVertices | null = null;
  /** The mesh the body was built from, kept so results can be drawn over it. */
  #mesh: DisplayGeometry['mesh'] | null = null;
  /** Each face's own colour, linear, three a face; undefined for the default look. */
  #own: Float32Array | undefined;
  /** A part drawn anew while it is changed (`part-preview.ts`). */
  readonly #part = new PartPreview(this.#surface, this.#lines);
  /** Simulation results drawn in place of the body, or null for the model itself. */
  #result: ResultOverlay | null = null;

  /** Reverse of `DisplayGeometry.faceRefs`: a name back to the index it was at. */
  #indexByName = new Map<string, number>();
  /** The names of the faces on show, by mesh face index, for area selection. */
  #faceRefs: readonly (StableRef | null)[] = [];

  #width = 1;
  #height = 1;
  readonly #cameraPosition = { x: 0, y: 0, z: 0 };
  #sketchPlaneForView: ViewPlane | null = null;
  /** The sketches on show, kept for picking their areas, one carried along while it is dragged. */
  readonly #shown = new ShownSketches((items) => this.#scene.setShownSketches(items));

  /** A model on its way in, by its outline (import-preview.ts). */
  readonly #importPreview = new ImportPreview();
  /** Pictures placed on a plane. */
  readonly images: ImageLayer;

  constructor(scene: ViewportScene) {
    this.#scene = scene;
    this.images = new ImageLayer(scene, () => ({ width: this.#width, height: this.#height }));
    // Wrap every method that can change the picture to mark it out of date.
    const methods = this as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(ViewportImpl.prototype)) {
      const method = Object.getOwnPropertyDescriptor(ViewportImpl.prototype, name)?.value;
      if (name === 'constructor' || QUERIES.has(name) || typeof method !== 'function') continue;
      methods[name] = (...args: unknown[]) => {
        const result: unknown = method.apply(this, args);
        scene.invalidate();
        return result;
      };
    }
    // In `content`, unlike the outline below: framing an empty view onto an arriving model is
    // right.
    scene.content.add(this.#importPreview.object);
    scene.setAnimating(() => this.#importPreview.animating);
    scene.setSurfaceProbe((x, y) => this.pick(x, y)?.point ?? null);
    scene.setFrameHooks(
      () => {
        const lod = this.#lod;
        if (lod === null) return;
        this.#view.update(scene.camera, this.#height);
        lod.plan(this.#view, scene.quality.moving, scene.budget.pressure);
      },
      (now) => this.#lod?.idle(scene.quality.stillFor(now), scene.budget.spare),
    );
    // While moving, a heavy model keeps only its larger parts' outlines, or none if it cannot be
    // outlined per part.
    scene.quality.onChange((moving) => {
      if (
        moving &&
        this.#mode !== 'wireframe' &&
        this.#wireframe !== null &&
        this.#lod?.outlinesPerPart !== true
      )
        this.#wireframe.visible = false;
      else this.#showWhatTheModeAsksFor();
      scene.invalidate();
    });
    // On the scene, not in `content`, so framing never measures it.
    scene.scene.add(this.#outline.object);
    scene.scene.add(this.#caps.object);
    scene.content.add(this.#part.group);
  }

  /** The cut face of a section, over the body when both are on show. */
  readonly #caps = new SectionCaps();

  #refreshCaps(): void {
    const body = this.#body;
    this.#caps.set(
      body?.geometry ?? null,
      this.#sectionZ,
      body?.visible === true && this.#mode === 'shaded',
    );
  }

  setAppearance(background: string, gridMinor: string, gridMajor: string): void {
    this.#scene.setAppearance(background, gridMinor, gridMajor);
  }

  setGeometry(geometry: DisplayGeometry | null): void {
    const started = performance.now();
    this.#setGeometry(geometry);
    // Alongside the studio's `bezier:` measures (trace.ts): main-thread cost of building buffers.
    performance.measure('bezier:upload', { start: started, end: performance.now() });
  }

  #setGeometry(geometry: DisplayGeometry | null): void {
    this.#clear();

    if (geometry === null) {
      this.#scene.setTriangleCount(0);
      this.#picker.setGeometry(null, []);
      this.#highlighter.setGeometry(null, null);
      this.#outline.setGeometry(null);
      return;
    }

    // Remove the import preview in the same frame the model appears.
    this.#importPreview.clear();
    this.#scene.mark('importOutline', null);
    const own =
      geometry.faceColours === undefined
        ? undefined
        : linearColours(geometry.faceColours, BASE_COLOUR);
    this.#own = own;
    const surface = buildGeometry(geometry.mesh, BASE_COLOUR, own);
    this.#faces = indexFaceVertices(geometry.mesh);
    this.#body = new ThreeMesh(surface, this.#surface);
    this.#mesh = geometry.mesh;
    this.#scene.content.add(this.#body);

    if (geometry.edges !== null) {
      this.#wireframe = new LineSegments(buildEdgeGeometry(geometry.edges), this.#lines);
      // Inherit what is switched on: rebuilding geometry must not undo a display mode the user
      // chose.
      this.#wireframe.visible = this.#edgesVisible;
      this.#showWhatTheModeAsksFor();
      this.#scene.content.add(this.#wireframe);
    }

    this.#indexByName = new Map();
    this.#faceRefs = geometry.faceRefs;
    geometry.faceRefs.forEach((ref, index) => {
      if (ref !== null) this.#indexByName.set(formatRef(ref), index);
    });

    const triangles = geometry.mesh.indices.length / 3;
    this.#scene.setTriangleCount(triangles);
    this.#scene.quality.setHeavy(triangles > HEAVY_TRIANGLES);
    this.#highlighter.setGeometry(surface, this.#faces, own);
    const generation = ++this.#generation;
    this.#lod = new LodBody({
      body: this.#body,
      wireframe: this.#wireframe,
      mesh: geometry.mesh,
      edges: geometry.edges,
      own,
      surface: this.#surface,
      lines: this.#lines,
      highlighter: this.#highlighter,
      detail: geometry.detail,
      onRefined: (mesh) => {
        if (generation !== this.#generation) return;
        const seams = buildSeams(mesh);
        this.#picker.adoptSeams(seams);
        this.#outline.adoptSeams(seams);
        this.#outlined = '\0'; // outlined again, from the new seams
        this.#refreshOutline();
      },
      background: this.#scene.background,
      invalidate: () => this.#scene.invalidate(),
    });
    const elsewhere = triangles > OFF_THREAD_TRIANGLES ? buildOffThread(geometry.mesh) : null;
    if (elsewhere === null) {
      this.#outline.setGeometry(geometry.mesh);
      this.#picker.setGeometry(geometry.mesh, geometry.faceRefs, 'build', this.#outline.seams);
    } else {
      // Picking and outlines follow when the worker is done, unless newer geometry replaced this.
      this.#picker.setGeometry(geometry.mesh, geometry.faceRefs, 'later');
      this.#outline.awaitSeams();
      void elsewhere.then(({ bvh, seams, corners }) => {
        if (generation !== this.#generation) return;
        this.#picker.adoptTree(bvh);
        this.#picker.adoptSeams(seams, corners);
        this.#outline.adoptSeams(seams);
        this.#scene.invalidate();
      });
    }

    // Reapply the display mode to the fresh material so a rebuild keeps it.
    this.setDisplayMode(this.#mode);
  }

  /** What the pointer is over, shown as an outline. */
  showPartPreview(part: PartMesh | null, replaces: readonly StableRef[] = []): void {
    const body = this.#body;
    const mesh = this.#mesh;
    const faces = replaces.flatMap((ref) => this.#indexByName.get(formatRef(ref)) ?? []);
    const wireframe = this.#wireframe;
    // The part stands in for a solid of the body; nothing else may draw that solid meanwhile.
    this.#lod?.suspend(part !== null);
    this.#part.show(part, body && mesh && { body, wireframe, mesh, faces, own: this.#own });
    this.#scene.mark('partPreview', part && String(part.mesh.indices.length / 3));
  }

  showMovedPreview(
    replaces: readonly StableRef[],
    matrix: readonly number[] | null,
    copy = false,
  ): void {
    const body = this.#body;
    const mesh = this.#mesh;
    const faces = replaces.flatMap((ref) => this.#indexByName.get(formatRef(ref)) ?? []);
    this.#lod?.suspend(matrix !== null);
    // The outline of what is picked stays where the body was; it goes while the body is moved.
    this.#outline.object.visible = matrix === null;
    const lifted = body &&
      mesh && { body, wireframe: this.#wireframe, mesh, faces, own: this.#own };
    this.#part.showMoved(
      lifted ?? null,
      matrix === null ? null : scratchMove.fromArray(matrix),
      copy,
    );
  }

  setHighlighted(refs: readonly StableRef[]): void {
    this.#hovered = refs[0] ?? null;
    const face = this.#hovered?.kind === 'face' ? [this.#hovered] : [];
    // A face under the pointer is filled, lighter than a picked one, as well as outlined.
    this.#highlighter.setHovered(this.#facesOf(face));
    this.#refreshOutline();
    this.#refreshSnapPoints(this.#hovered);
  }

  setSelected(refs: readonly StableRef[]): void {
    this.#chosen = refs;
    // A picked face is filled; a picked edge is drawn as a line.
    this.#highlighter.setSelected(this.#facesOf(refs.filter((ref) => ref.kind === 'face')));
    this.#refreshOutline();
  }

  setResultField(field: ResultField | null): void {
    if (field === null || this.#mesh === null) {
      this.#dropResult();
      return;
    }
    if (this.#result === null) {
      this.#result = new ResultOverlay(this.#mesh, field);
      this.#scene.content.add(this.#result.object);
    } else {
      this.#result.update(field);
    }
    // The body and the results are the same surface; drawing both would z-fight. The edges stay,
    // undeformed, as the reference shape.
    this.#showWhatTheModeAsksFor();
  }

  sampleResult(screenX: number, screenY: number): number | null {
    return (
      this.#result?.sample(
        this.#scene.camera,
        (screenX / this.#width) * 2 - 1,
        1 - (screenY / this.#height) * 2,
      ) ?? null
    );
  }

  setResultDeform(scale: number): void {
    this.#result?.setDeform(scale);
  }

  #dropResult(): void {
    if (this.#result === null) return;
    this.#scene.content.remove(this.#result.object);
    this.#result.dispose();
    this.#result = null;
    this.#showWhatTheModeAsksFor();
  }

  #refreshOutline(): void {
    const target = this.#chosen.find((ref) => ref.kind !== 'face') ?? this.#hovered;

    // Rebuilding a fat line is costly; skip it while the pointer stays on the same thing.
    const key = target === null || target === undefined ? '' : formatRef(target);
    if (key === this.#outlined) return;
    this.#outlined = key;

    if (target === null || target === undefined) {
      this.#outline.clear();
      return;
    }
    const faces = this.#indicesOf(target);
    const [a, b] = faces;
    if (target.kind === 'edge' && a !== undefined && b !== undefined) {
      this.#outline.showSeam(a, b);
      return;
    }
    if (target.kind === 'vertex') {
      const corner = this.#picker.cornerOf(faces);
      if (corner === null) this.#outline.clear();
      else markCorner(this.#outline, corner, this.#scene.camera.position, this);
      return;
    }
    this.#outline.showFaces(faces);
  }

  /** The face indices a single reference covers, in the order it names them. */
  #indicesOf(ref: StableRef): number[] {
    const parts = ref.kind === 'face' ? [ref] : ref.faces;
    const out: number[] = [];
    for (const face of parts) {
      const index = this.#indexByName.get(formatRef(face));
      if (index !== undefined) out.push(index);
    }
    return out;
  }

  pick(screenX: number, screenY: number, filter: PickFilter = 'any'): PickResult | null {
    if (!this.#picker.ready) return null;

    const ndcX = (screenX / this.#width) * 2 - 1;
    const ndcY = -(screenY / this.#height) * 2 + 1;

    const radiusX = (EDGE_TOLERANCE_PX * 2) / this.#width;
    const radiusY = (EDGE_TOLERANCE_PX * 2) / this.#height;
    return this.#picker.pick(this.#scene.camera, ndcX, ndcY, radiusX, filter, radiusY);
  }

  pickThrough(x: number, y: number): StableRef[] {
    const [ndcX, ndcY] = [(x / this.#width) * 2 - 1, 1 - (y / this.#height) * 2];
    return this.#picker.ready ? this.#picker.facesAlong(this.#scene.camera, ndcX, ndcY) : [];
  }

  squareAt(screenX: number, screenY: number, animate = false): boolean {
    const hit = this.pick(screenX, screenY, 'face');
    const index = hit?.ref.kind === 'face' ? this.#indexByName.get(formatRef(hit.ref)) : undefined;
    if (hit === null || index === undefined) return false;
    // At the hit point, not averaged over the face, so curved faces square up where the pointer is.
    const frames = this.#meshFrames();
    const normal = faceNormalAt(frames, index, hit.point);
    if (normal === null) return false;
    this.#scene.squareOn(normal, hit.point, animate, faceBoundsByIndex(frames, index));
    return true;
  }

  project(x: number, y: number, z: number): { x: number; y: number } | null {
    scratchProject.set(x, y, z).project(this.#scene.camera);
    // z outside [-1, 1] is outside the near/far planes: not on screen.
    if (scratchProject.z < -1 || scratchProject.z > 1) return null;
    return {
      x: (scratchProject.x * 0.5 + 0.5) * this.#width,
      y: (-scratchProject.y * 0.5 + 0.5) * this.#height,
    };
  }

  facesInRect(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    mode: 'window' | 'crossing',
  ): readonly StableRef[] {
    const mesh = this.#mesh;
    if (mesh === null) return [];
    const rect = { x0, y0, x1, y1 };
    return facesInRect(mesh, this.#faceRefs, (x, y, z) => this.project(x, y, z), rect, mode);
  }

  pointVisible(x: number, y: number, z: number): boolean {
    return this.#picker.pointVisible(this.#scene.camera, x, y, z);
  }

  contentCenter(): { x: number; y: number; z: number } | null {
    return this.#scene.contentCenter();
  }

  /** A view to save and go back to (`camera-view.ts`, audit F-034). */
  cameraView(): CameraView {
    return viewOf(this.#scene);
  }

  showCameraView(view: CameraView): void {
    showView(this.#scene, view);
    this.#sketchPlaneForView = null;
  }

  cameraPosition(): Readonly<{ x: number; y: number; z: number }> {
    const position = this.#scene.camera.position;
    this.#cameraPosition.x = position.x;
    this.#cameraPosition.y = position.y;
    this.#cameraPosition.z = position.z;
    return this.#cameraPosition;
  }

  worldPerPixelAt(distance: number): number {
    const camera = this.#scene.camera;
    const projection =
      'isOrthographicCamera' in camera && camera.isOrthographicCamera === true
        ? {
            isOrthographicCamera: true as const,
            top: camera.top,
            bottom: camera.bottom,
            zoom: camera.zoom,
          }
        : { fov: 'fov' in camera ? camera.fov : 50 };
    return worldPerPixel(projection, distance, this.#height);
  }

  edgeFrame(ref: StableRef, anchor?: { x: number; y: number; z: number }): EdgeFrame | null {
    if (ref.kind !== 'edge') return null;
    const [a, b] = this.#indicesOf(ref);
    if (a === undefined || b === undefined) return null;
    return edgeFrameBetween(this.#meshFrames(), this.#outline, a, b, {
      x: anchor?.x ?? 0,
      y: anchor?.y ?? 0,
      z: anchor?.z ?? 0,
    });
  }

  faceCentroid(ref: StableRef): { x: number; y: number; z: number } | null {
    // A corner is its own middle: where a gizmo for it hangs.
    if (ref.kind === 'vertex') return this.#picker.cornerOf(this.#indicesOf(ref));
    if (ref.kind !== 'face') return null;
    const index = this.#indexByName.get(formatRef(ref));
    return index === undefined ? null : faceCentroidByIndex(this.#meshFrames(), index);
  }

  faceNormal(ref: StableRef): { x: number; y: number; z: number } | null {
    if (ref.kind !== 'face') return null;
    const index = this.#indexByName.get(formatRef(ref));
    return index === undefined ? null : faceNormalByIndex(this.#meshFrames(), index);
  }

  /** The buffers the measurements in `frames.ts` read. */
  #meshFrames(): MeshFrames {
    return { faces: this.#faces, geometry: this.#body?.geometry ?? null };
  }

  setSketchPlanesVisible(visible: boolean): void {
    this.#scene.setSketchPlanesVisible(visible);
  }

  /** The snap point nearest the pointer within a screen-space tolerance, or null. */
  snapAt(screenX: number, screenY: number): { x: number; y: number; z: number } | null {
    let best: { x: number; y: number; z: number } | null = null;
    let bestDistance = SNAP_TOLERANCE_PX;
    for (const point of this.#snapPoints) {
      const at = this.project(point.x, point.y, point.z);
      if (at === null) continue;
      const distance = Math.hypot(at.x - screenX, at.y - screenY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    return best;
  }

  /** Re-applies navigation settings after the user changed them. */
  setNavigation(prefs: NavigationPrefs): void {
    this.#scene.setNavigation(prefs);
  }

  onScrollDevice(listener: ((device: 'mouse' | 'trackpad') => void) | null): void {
    this.#scene.onScrollDevice(listener);
  }

  navigationClaims(event: {
    button: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  }): boolean {
    return this.#scene.navigationClaims(event);
  }

  /** Turns measurement snap points on or off; off by default, since computing them walks seams. */
  setSnapping(on: boolean): void {
    this.#snapping = on;
    this.#snapFace = '';
    if (!on) this.#snapPoints = [];
  }

  /**
   * Snap points on the face under the pointer (corners and centre), in world millimetres. Stored,
   * since the measure overlay reads them every frame.
   */
  snapPoints(): readonly { x: number; y: number; z: number }[] {
    return this.#snapPoints;
  }

  #refreshSnapPoints(ref: StableRef | null): void {
    if (!this.#snapping || ref === null || ref.kind !== 'face') {
      this.#snapPoints = [];
      this.#snapFace = '';
      return;
    }
    const key = formatRef(ref);
    if (key === this.#snapFace) return;
    this.#snapFace = key;
    const faces = this.#indicesOf(ref);
    const points = this.#outline.cornersOf(faces);
    const centre = this.faceCentroid(ref);
    if (centre !== null) points.push(centre);
    const sectionZ = this.#sectionZ;
    this.#snapPoints = sectionZ === null ? points : points.filter((point) => point.z <= sectionZ);
  }

  /**
   * Shows the negative half of the world axis under the pointer. The direction is sampled a fixed
   * distance out, since the axis' real end is far away and may be behind the camera.
   */
  hoverAxis(screenX: number, screenY: number): number | null {
    const origin = this.project(0, 0, 0);
    const eye = this.#scene.camera.position;
    const span = AXIS_PROBE * Math.max(Math.hypot(eye.x, eye.y, eye.z), 1e-3);
    const tips = [this.project(span, 0, 0), this.project(0, span, 0), this.project(0, 0, span)];
    const axis = axisUnderPointer(origin, tips, { x: screenX, y: screenY }, AXIS_TOLERANCE_PX);
    this.#scene.setHoveredAxis(axis);
    return axis;
  }

  hoverSketchPlane(screenX: number, screenY: number): PlaneName | null {
    const plane = this.#scene.pickSketchPlane(
      (screenX / this.#width) * 2 - 1,
      -(screenY / this.#height) * 2 + 1,
    );
    this.#scene.setSketchPlaneHovered(plane);
    return plane;
  }

  pickSketchPlane(screenX: number, screenY: number): PlaneName | null {
    return this.#scene.pickSketchPlane(
      (screenX / this.#width) * 2 - 1,
      -(screenY / this.#height) * 2 + 1,
    );
  }

  sketchPoint(
    screenX: number,
    screenY: number,
    plane: SketchSurface,
  ): { u: number; v: number } | null {
    const basis = surfaceBasis(plane);
    if (basis === null) return null;
    return this.#scene.sketchDraw.hit(
      this.#scene.camera,
      basis,
      (screenX / this.#width) * 2 - 1,
      -(screenY / this.#height) * 2 + 1,
    );
  }

  sketchHitRadius(screenX: number, screenY: number, plane: SketchSurface, pixels: number): number {
    const at = this.sketchPoint(screenX, screenY, plane);
    if (at === null) return 0;
    // Probe both screen axes and take the larger: at a glancing angle the plane is anisotropic.
    const alongX = this.sketchPoint(screenX + pixels, screenY, plane);
    const alongY = this.sketchPoint(screenX, screenY + pixels, plane);
    const spanX = alongX === null ? 0 : Math.hypot(alongX.u - at.u, alongX.v - at.v);
    const spanY = alongY === null ? 0 : Math.hypot(alongY.u - at.u, alongY.v - at.v);
    return Math.max(spanX, spanY);
  }

  setSketchDraft(
    plane: SketchSurface | null,
    sketch: Sketch | null,
    pending: readonly { u: number; v: number }[] = [],
    selected: readonly SketchId[] = [],
    defined: ReadonlySet<SketchId> = new Set(),
  ): void {
    const basis = plane === null ? null : surfaceBasis(plane);
    this.#scene.helpers.setSketchBasis(basis);
    this.#scene.sketchDraw.set(basis, sketch, pending, new Set(selected), undefined, defined);
  }

  setReferenceMeshes(meshes: readonly ReferenceMesh[]): void {
    this.#scene.setReferenceMeshes(meshes);
  }

  setShownSketches(sketches: readonly ShownSketch[]): void {
    this.#shown.set(sketches);
  }

  moveShownSketch(id: string | null, by: { x: number; y: number; z: number } | null): void {
    this.#shown.move(id, by);
  }

  pickSketchArea(screenX: number, screenY: number): SketchAreaHit | null {
    return this.#shown.pick(this.#scene.camera, (plane) =>
      this.sketchPoint(screenX, screenY, plane),
    );
  }

  setDisplayMode(mode: DisplayMode): void {
    this.#mode = mode;
    this.#surface.transparent = mode === 'xray';
    this.#surface.opacity = mode === 'xray' ? 0.32 : 1;
    // Otherwise x-ray still hides its own back faces.
    this.#surface.depthWrite = mode !== 'xray';
    surfaceAnalysis.value = mode === 'zebra' ? 1 : mode === 'curvature' ? 2 : 0;
    this.#surface.needsUpdate = true;
    this.#showWhatTheModeAsksFor();
  }

  setEdgesVisible(visible: boolean): void {
    this.#edgesVisible = visible;
    this.#showWhatTheModeAsksFor();
  }

  /**
   * Decides whether the shaded body and edges are drawn, from both reasons to hide the body
   * (results overlay, wireframe) together (`display-mode.ts`). Wireframe draws the B-Rep edges.
   */
  #showWhatTheModeAsksFor(): void {
    const drawn = visibilityFor(this.#mode, this.#result !== null, this.#edgesVisible);
    // Edges on a shaded body can be dark; against the empty canvas they need contrast.
    this.#lines.color.setHex(this.#mode === 'wireframe' ? 0xa7a9ae : 0x0b0c0e);
    if (this.#body !== null) this.#body.visible = drawn.body;
    if (this.#wireframe !== null) this.#wireframe.visible = drawn.edges;
    this.#refreshCaps();
  }

  setGridVisible(visible: boolean): void {
    this.#datum.setVisible(visible);
    this.#scene.setGridVisible(visible);
  }

  setGridPlane(plane: GridPlane): void {
    this.#datum.setPlane(plane);
    this.#scene.helpers.setGridPlane(plane);
  }

  setSelectionColour(hex: number): void {
    this.#highlighter.setColour(hex);
    this.#outline.setColour(hex);
    setSketchSelectionColour(hex);
  }

  setAxesVisible(visible: boolean): void {
    this.#scene.setAxesVisible(visible);
  }

  setFieldOfView(degrees: number, parallel = false): void {
    this.#scene.setFieldOfView(degrees);
    this.#scene.setParallel(parallel);
  }

  setOrthographic(on: boolean): void {
    this.#scene.setOrthographic(on);
  }

  isOrthographic(): boolean {
    return this.#scene.isOrthographic;
  }

  setSection(at: number | null): void {
    this.#sectionZ = at;
    this.#picker.setSection(at);
    this.#snapFace = '';
    this.#refreshSnapPoints(this.#hovered);
    this.#scene.setSection(at);
    this.#refreshCaps();
  }

  setViewBetween(sides: readonly CubeSide[], animate = false): void {
    this.#scene.setViewBetween(sides, animate);
    this.#sketchPlaneForView = planeBetween(sides);
  }

  pressFabric(point: { x: number; y: number } | null): void {
    this.#scene.pressFabric(point);
  }

  setView(view: ViewName, animate = false): void {
    this.#scene.setView(view, animate);
    this.#sketchPlaneForView = view === 'default' ? null : planeBetween([view]);
  }

  viewCubeMatrix(): readonly number[] {
    return this.#scene.viewCubeMatrix();
  }

  orbit(deltaAzimuth: number, deltaPolar: number): void {
    this.#scene.orbit(deltaAzimuth, deltaPolar);
    this.#sketchPlaneForView = null;
  }

  spin(deltaAzimuth: number, animate = false): void {
    const previous = this.#sketchPlaneForView;
    this.#scene.spin(deltaAzimuth, animate);
    this.#sketchPlaneForView = planeSpun(previous);
  }

  sketchPlaneForView(): ViewPlane | null {
    return this.#sketchPlaneForView;
  }

  capture(options: { scale?: number; transparent?: boolean } = {}): Promise<Blob | null> {
    return this.#scene.capture(options);
  }

  zoomToFit(box?: Bounds): void {
    this.#scene.fit(box);
  }

  frameTimes(): readonly number[] {
    return this.#scene.frameTimes();
  }

  resetFrameTimes(): void {
    this.#scene.resetFrameTimes();
  }

  resize(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
    // The outline's width is in pixels.
    this.#outline.setSize(width, height);
    this.#scene.resize(width, height);
  }

  /**
   * Shows the outline of a model still being imported, or null to stop. `colour` is a CSS colour;
   * the view frames it when nothing else is shown.
   */
  showImportPreview(outline: { edges: EdgeSet; box: Bounds } | null, colour = '#8a8a8e'): void {
    this.#scene.mark('importOutline', outline && String(outline.edges.polylineStarts.length));
    if (outline === null) {
      this.#importPreview.clear();
      return;
    }
    this.#importPreview.show(outline.edges, outline.box, colour);
    if (this.#body === null) this.#scene.fit();
  }

  /** Parts of a model still being meshed, shown until the model itself arrives. */
  showImportPiece(piece: MeshPiece): void {
    const first = !this.#importPreview.hasPieces;
    this.#importPreview.addPiece(piece);
    if (first && this.#body === null) this.#scene.fit();
  }

  /** Whether a screen point (CSS pixels) falls inside the bounds of a model being imported. */
  hitsImportPreview(x: number, y: number): boolean {
    return this.#importPreview.hits(this.#scene.camera, x, y, this.#width, this.#height);
  }

  dispose(): void {
    this.#clear();
    this.#importPreview.dispose();
    this.#outline.dispose();
    this.#caps.dispose();
    this.#surface.dispose();
    this.#lines.dispose();
    this.images.dispose();
    this.#scene.dispose();
  }

  /** The face indices these references cover, each once (an edge covers both its faces). */
  #facesOf(refs: readonly StableRef[]): number[] {
    return [...new Set(refs.flatMap((ref) => this.#indicesOf(ref)))];
  }

  /** GPU geometry is not garbage collected, so it is disposed explicitly. */
  #clear(): void {
    this.#lod?.dispose();
    this.#lod = null;
    this.#part.clear();
    this.#outline.object.visible = true;
    this.#scene.mark('partPreview', null);
    this.#own = undefined;
    this.#dropResult();
    this.#mesh = null;
    this.#snapFace = '';
    this.#snapPoints = [];
    if (this.#body !== null) {
      this.#scene.content.remove(this.#body);
      this.#body.geometry.dispose();
      this.#body = null;
    }
    this.#refreshCaps();
    if (this.#wireframe !== null) {
      this.#scene.content.remove(this.#wireframe);
      this.#wireframe.geometry.dispose();
      this.#wireframe = null;
    }
    this.#faces = null;
    this.#indexByName = new Map();
  }
}
