/**
 * @bezier/renderer: the viewport. Takes tessellated geometry from @bezier/core and draws it.
 * Resolves clicks back into stable references, so a selection means something after a rebuild. See
 * ./README.md.
 */

export { Bvh, createRayHit, type RayHit } from './bvh.js';
export { type ActiveCamera, CameraRig } from './camera.js';
export { buildEdgeGeometry } from './edges.js';
export type { EdgeFrame } from './frames.js';
export { gridLevel, gridReach } from './grid-lod.js';
export type { GridPlane } from './helpers.js';
export { createHelpers, type Helpers } from './helpers.js';
export {
  BASE_COLOUR,
  type FaceColour,
  Highlighter,
  HOVER_COLOUR,
  OUTLINE_COLOUR,
  SELECTED_COLOUR,
} from './highlight.js';
export type { DetailSource } from './lod-body.js';
export { buildGeometry, type FaceVertices, indexFaceVertices } from './mesh.js';
export { Outliner } from './outline.js';
export type { PartMesh } from './part-preview.js';
export { Picker, type PickFilter, type PickResult } from './picking.js';
export type { PresentationRenderer, PresentationSettings } from './presentation.js';
export type { EmissionDirection, EmissionMode } from './presentation-emission.js';
export type { FaceAppearance } from './presentation-face-materials.js';
export type { FaceLook } from './presentation-faces.js';
export { NO_FACE_LOOK } from './presentation-faces.js';
export type {
  PresentationMaterialSurface,
  PresentationProceduralPattern,
} from './presentation-material.js';
/** The presentation engine is loaded only when its workspace is opened. */
export async function createPresentation(canvas: HTMLCanvasElement) {
  const { PresentationRenderer } = await import('./presentation.js');
  return PresentationRenderer.create(canvas);
}
export { type ResultField, ResultOverlay, type ResultPalette } from './result-overlay.js';
export { type CubeSide, type SceneOptions, type ViewName, ViewportScene } from './scene.js';
export { createSketchDraw, type Point2Like, type SketchDraw } from './sketch-draw.js';
export { createSketchPlanes, type PlaneName, type SketchPlanes } from './sketch-planes.js';
export type {
  CameraView,
  DisplayGeometry,
  DisplayMode,
  ShownSketch,
  SketchAreaHit,
  ViewPlane,
  Viewport,
  ViewportOptions,
} from './viewport-api.js';

import { ViewportScene } from './scene.js';
import { ViewportImpl } from './viewport.js';
import type { Viewport, ViewportOptions } from './viewport-api.js';

/**
 * Creates a viewport bound to a canvas. Picking is a CPU raycast over a BVH, not a GPU id buffer
 * (ADR 0007): `readPixels` stalls the pipeline and on some drivers exceeds the 8 ms hover budget.
 * See `bvh.ts`.
 */
export function createViewport(options: ViewportOptions): Viewport {
  return new ViewportImpl(
    new ViewportScene(
      options.pixelRatio === undefined
        ? { canvas: options.canvas }
        : { canvas: options.canvas, pixelRatio: options.pixelRatio },
    ),
  );
}
export { type Framing, frameBounds } from './framing.js';
export { setMotionPreference } from './interaction-quality.js';
export { DEFAULT_NAVIGATION, type NavigationPrefs } from './navigation.js';
export {
  DRAG_CHOICES,
  type DragBinding,
  describeDrag,
  NAVIGATION_PRESETS,
  type NavAction,
  type NavigationPresetId,
  presetById,
  resolveNavigation,
} from './navigation-map.js';
export type { DecalPlacement } from './presentation-decals.js';
export type { ImageLayer, ReferenceImage, ReferenceImagePlacement } from './reference-images.js';
export type { ReferenceMesh } from './reference-meshes.js';
export { handOnWheel } from './wheel-input.js';
