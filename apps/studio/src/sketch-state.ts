/** The sketch mode state exposed to the app (`use-sketch.ts`): draft, tool, snap and actions. */

import type { FeatureId } from '@bezier/core';
import type { Sketch, SketchId } from '@bezier/solver';
import type { ConstraintTool, EditResult, Point2D, SketchTool } from '@bezier/ui';
import type { SketchGrabber } from './use-sketch-grip.js';

export interface SketchState {
  /** The active tool, or null when clicks select. */
  tool: SketchTool | null;
  setTool: (tool: SketchTool | null) => void;
  /** Drawn but not yet committed. */
  draft: Sketch;
  /** Primitives selected while no drawing tool is active. */
  selected: readonly SketchId[];
  /** The rubber band: where the shape in progress currently extends to. */
  pending: readonly Point2D[];
  /** Snap label for the point under the pointer: Endpoint, Midpoint, Grid. */
  snap: string | null;
  /** True when the draft is a single profile a solid feature can use. */
  closed: boolean;
  /** A click on the sketch plane, in plane millimetres. */
  click: (at: Point2D, additive?: boolean, hitRadius?: number) => void;
  /** Removes the selected primitives from the draft. */
  deleteSelected: () => void;
  /** Sets an editable line dimension in millimetres. */
  changeLineLength: (id: SketchId, length: number) => void;
  /** Sets an editable circle radius in millimetres. */
  changeCircleRadius: (id: SketchId, radius: number) => void;
  /** Sets the value of a standalone dimension constraint. */
  changeConstraintValue: (id: SketchId, value: number) => void;
  /** Remaining degrees of freedom (0 is fully defined), or null when unknown. */
  freedom: number | null;
  /** Elements fully determined by constraints, once the drawing has settled. */
  defined: ReadonlySet<SketchId>;
  /** Constraints to mark: one a refused change contradicted, or one that is redundant. */
  flags: ReadonlyMap<SketchId, 'conflict' | 'redundant'>;
  /** Applies a solved edit of the picked elements; returns false with a notice otherwise. */
  applyEdit: (result: EditResult) => boolean;
  /** Pointer moved over the plane, for the rubber band. */
  move: (at: Point2D | null, hitRadius?: number) => void;
  /** Discards the shape in progress, keeping the committed draft. */
  cancelShape: () => void;
  /** Removes the last drawn element. False when there was nothing. */
  undoLast: () => boolean;
  /** Discards the whole drawing. */
  clear: () => void;
  /** Writes the draft into the document when sketch mode exits. */
  finish: () => void;
  /** Digits typed for the shape in progress, or '' when the pointer decides. */
  typed: string;
  /** Feeds a keystroke to the typed length. Returns true when consumed. */
  typeLength: (key: string) => boolean;
  /** Reopens a committed sketch so Finish writes back to it. */
  resume: (id: FeatureId, sketch: Sketch) => void;
  /** Adds a constraint between the selected elements, solved immediately. */
  constrainSelection: (tool: ConstraintTool) => void;
  /** Removes a constraint. */
  removeConstraint: (id: SketchId) => void;
  /** Sets an angle constraint, in degrees as shown. */
  changeAngle: (id: SketchId, degrees: number) => void;
  /** Whether new geometry is construction geometry (the Centerline tool). */
  drawingConstruction: boolean;
  /** Draws construction geometry with the current tool until the tool changes. */
  setDrawingConstruction: (on: boolean) => void;
  /** Toggles construction on the selected lines and curves. */
  toggleConstructionSelected: () => void;
  /** Adds edges, as polylines in plane coordinates, to the drawing (Project). */
  project: (outline: readonly (readonly { x: number; y: number }[])[]) => void;
  /** Fillets or chamfers the corner between the two selected lines. */
  roundSelectedCorner: (style: 'fillet' | 'chamfer', size: number) => void;
  /** Grabbing and moving drawn geometry with no tool active. */
  grip: SketchGrabber;
}
