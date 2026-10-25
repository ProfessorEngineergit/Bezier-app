/**
 * @bezier/ui: React components. Viewport chrome, feature tree, property panels, sketch tools,
 * gizmos. Presentation and interaction only; no geometry logic. See ./README.md.
 */

export type { FeatureTreeProps } from './FeatureTree.js';
export { FeatureTree } from './FeatureTree.js';
export * from './icons/Icons.js';
export * from './icons/SimulationIcons.js';
export type { PropertyPanelProps } from './PropertyPanel.js';
export { PropertyPanel } from './PropertyPanel.js';
export type { Control } from './param-control.js';
export { controlsFor, formatNumber, valueFromInput } from './param-control.js';
export * from './shell/index.js';
export { currentAngle, shownDegrees, withAngle } from './sketch-angle.js';
export type { Rect } from './sketch-builder.js';
export {
  addToSketch,
  distanceBetween,
  lineSketch,
  lockPoint,
  rectangleSketch,
} from './sketch-builder.js';
export {
  CONSTRAINT_TOOLS,
  type ConstrainResult,
  type ConstraintTool,
  constrain,
  describeConstraint,
  dimension,
  dimensionOf,
  type SolvedDraft,
  setConstraintValue,
  solveInto,
  unconstrain,
} from './sketch-constraints.js';
export { markNewAsConstruction, toggleConstruction } from './sketch-construction.js';
export { type CornerResult, roundCorner } from './sketch-corner.js';
export {
  arcThrough,
  circleFromCenter,
  curveNear,
  sampleArc,
  sampleCircle,
  sampleCurve,
  setCircleRadius,
} from './sketch-curves.js';
export { deleteSketchPrimitives } from './sketch-delete.js';
export { lineLength, setLineLength } from './sketch-dimensions.js';
export {
  type Docking,
  type DockPoint,
  dockingFrom,
  dockOn,
  NO_DOCKING,
} from './sketch-docking.js';
export { dragSketch, gripAt, type SketchGrip } from './sketch-drag.js';
export {
  type EditResult,
  extendAt,
  mirrorSelection,
  offsetSelection,
  patternSelection,
  type Repeat,
  splitAt,
  transformSelection,
} from './sketch-edit.js';
export {
  dxfToSketch,
  type SketchRead,
  sketchToDxf,
  sketchToSvg,
  svgToSketch,
} from './sketch-files.js';
export { namedBy, pointsOf } from './sketch-id.js';
export { areaAt, closedProfileContains, isClosed, sketchAreas } from './sketch-profile.js';
export { projectOutline } from './sketch-project.js';
export {
  isShapeTool,
  SHAPE_CLICKS,
  type ShapeTool,
  shapeClick,
  splineThrough,
} from './sketch-shapes.js';
export { type Font, parseFont, textToSketch } from './sketch-text.js';
export type { Point2D, SketchTool } from './sketch-tools.js';
export {
  anchorAtOrigin,
  centerRectangleAt,
  connect,
  emptySketch,
  ensurePoint,
  lineNear,
  pointNear,
  positionOf,
  rectangleAt,
  SNAP_DISTANCE,
  SNAP_NAMES,
  type SnapKind,
  snapCandidate,
  snapSketchPoint,
  snapToGrid,
} from './sketch-tools.js';
export { trimAt } from './sketch-trim.js';
export { typedNumber } from './typed-number.js';
