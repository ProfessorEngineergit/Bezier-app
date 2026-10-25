/**
 * Sketch geometry, constraints and solve results. Plain serialisable objects with our own string
 * ids, written as-is into saved documents.
 */

/** Id of a sketch element, stable across solves and saves. */
export type SketchId = string;

export interface Point2 {
  x: number;
  y: number;
}

// Geometry.

export interface SketchPoint {
  kind: 'point';
  id: SketchId;
  x: number;
  y: number;
  /** Never moved by the solver. */
  fixed?: boolean;
}

export interface SketchLine {
  kind: 'line';
  id: SketchId;
  /** Endpoint ids, each a `SketchPoint`. */
  start: SketchId;
  end: SketchId;
  /** Guides the sketch but is not part of the profile. */
  construction?: boolean;
  /** Id of a group placed as one (e.g. text); members get no size label of their own. */
  group?: string;
}

export interface SketchCircle {
  kind: 'circle';
  id: SketchId;
  center: SketchId;
  radius: number;
  construction?: boolean;
}

export interface SketchArc {
  kind: 'arc';
  id: SketchId;
  center: SketchId;
  start: SketchId;
  end: SketchId;
  construction?: boolean;
}

/**
 * A smooth curve through ordinary sketch points, in order. A closed spline joins the last point
 * back to the first without a corner.
 */
export interface SketchSpline {
  kind: 'spline';
  id: SketchId;
  points: readonly SketchId[];
  closed?: boolean;
  construction?: boolean;
  /** See `SketchLine.group`. */
  group?: string;
}

/** An ellipse: centre, major-axis endpoint (size and rotation) and semi-minor axis. */
export interface SketchEllipse {
  kind: 'ellipse';
  id: SketchId;
  center: SketchId;
  vertex: SketchId;
  minor: number;
  construction?: boolean;
}

export type SketchPrimitive =
  | SketchPoint
  | SketchLine
  | SketchCircle
  | SketchArc
  | SketchSpline
  | SketchEllipse;

// Constraints.

/**
 * Kind names and fields are saved in documents and must not change. A dimension with `reference`
 * is measured and shown but never solved (planegcs's own non-driving constraints are buggy
 * upstream, see the README).
 */
export type SketchConstraint =
  /** Two points coincide. Snapping creates these. */
  | { kind: 'coincident'; id: SketchId; a: SketchId; b: SketchId }
  | { kind: 'horizontal'; id: SketchId; line: SketchId }
  | { kind: 'vertical'; id: SketchId; line: SketchId }
  | { kind: 'parallel'; id: SketchId; a: SketchId; b: SketchId }
  | { kind: 'perpendicular'; id: SketchId; a: SketchId; b: SketchId }
  | { kind: 'tangent'; id: SketchId; a: SketchId; b: SketchId }
  | { kind: 'equal'; id: SketchId; a: SketchId; b: SketchId }
  | { kind: 'concentric'; id: SketchId; a: SketchId; b: SketchId }
  /** A point lies on a line (extended past its ends), a circle or an arc. */
  | { kind: 'pointOn'; id: SketchId; point: SketchId; on: SketchId }
  /** A point at the middle of a line. */
  | { kind: 'midpoint'; id: SketchId; point: SketchId; line: SketchId }
  /** Points `a` and `b` mirror each other about a line or a point. */
  | { kind: 'symmetric'; id: SketchId; a: SketchId; b: SketchId; about: SketchId }
  /** Two lines on one infinite line. */
  | { kind: 'collinear'; id: SketchId; a: SketchId; b: SketchId }
  /** Two points at the same y, or the same x. */
  | { kind: 'horizontalPoints'; id: SketchId; a: SketchId; b: SketchId }
  | { kind: 'verticalPoints'; id: SketchId; a: SketchId; b: SketchId }
  /** The angle from line `a` to line `b` equals the angle from line `c` to line `d`. */
  | { kind: 'equalAngle'; id: SketchId; a: SketchId; b: SketchId; c: SketchId; d: SketchId }
  /** Line `b` is `ratio` times as long as line `a`. */
  | { kind: 'lengthRatio'; id: SketchId; a: SketchId; b: SketchId; ratio: number }
  /** A distance in millimetres. */
  | {
      kind: 'distance';
      id: SketchId;
      a: SketchId;
      b: SketchId;
      value: number;
      reference?: true;
    }
  /** Signed x offset from `a` to `b`. */
  | {
      kind: 'horizontalDistance';
      id: SketchId;
      a: SketchId;
      b: SketchId;
      value: number;
      reference?: true;
    }
  /** Signed y offset from `a` to `b`. */
  | {
      kind: 'verticalDistance';
      id: SketchId;
      a: SketchId;
      b: SketchId;
      value: number;
      reference?: true;
    }
  /** Distance from a point to a line (extended past its ends). */
  | {
      kind: 'pointLineDistance';
      id: SketchId;
      point: SketchId;
      line: SketchId;
      value: number;
      reference?: true;
    }
  | { kind: 'radius'; id: SketchId; circle: SketchId; value: number; reference?: true }
  | { kind: 'diameter'; id: SketchId; circle: SketchId; value: number; reference?: true }
  | {
      kind: 'angle';
      id: SketchId;
      a: SketchId;
      b: SketchId;
      valueRadians: number;
      reference?: true;
    }
  /** Pins a point to an absolute position, usually the sketch origin. */
  | { kind: 'lock'; id: SketchId; point: SketchId; x: number; y: number };

export interface Sketch {
  primitives: readonly SketchPrimitive[];
  constraints: readonly SketchConstraint[];
}

// Results.

export type SolveStatus =
  /** Fully solved. */
  | 'solved'
  /** Converged to a solution, but the sketch is still under-constrained. */
  | 'under-constrained'
  /** Constraints contradict each other. See `conflicting`. */
  | 'conflicting'
  /** Did not converge, usually a badly conditioned sketch. */
  | 'failed';

/** The solver's report, including diagnostics for the UI (see the README). */
export interface SolveResult {
  status: SolveStatus;
  /** Solved positions, keyed by primitive id. Present unless status is 'failed'. */
  positions: ReadonlyMap<SketchId, Point2>;
  /** Solved radii for circles and arcs, keyed by primitive id. */
  radii: ReadonlyMap<SketchId, number>;
  /** Remaining degrees of freedom. Zero means fully constrained. */
  dof: number;
  /** Ids of constraints that contradict one another. */
  conflicting: readonly SketchId[];
  /** Ids of constraints already implied by others. */
  redundant: readonly SketchId[];
}
