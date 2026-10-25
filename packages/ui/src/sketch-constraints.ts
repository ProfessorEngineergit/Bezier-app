/**
 * Applies constraints to the sketch selection: relations the user adds explicitly and typed
 * dimensions, stored as constraints so the solver keeps them. Drawing tools add some relations
 * themselves (rectangle sides, shared snap points). `solveInto` runs the app's solver and writes
 * the result back into the points.
 */

import type {
  ConstraintSolver,
  Sketch,
  SketchConstraint,
  SketchId,
  SketchPrimitive,
  SolveResult,
} from '@bezier/solver';
import { currentAngle, shownDegrees } from './sketch-angle.js';
import { pointsOf } from './sketch-id.js';

export type ConstraintTool =
  | 'aligned'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'angle'
  | 'equal'
  | 'tangent'
  | 'concentric'
  | 'coincident'
  | 'pointOn'
  | 'midpoint'
  | 'symmetric'
  | 'collinear'
  | 'equalAngle'
  | 'lengthRatio'
  | 'distance'
  | 'horizontalDistance'
  | 'verticalDistance'
  | 'pointLineDistance'
  | 'reference'
  | 'fix';

export const CONSTRAINT_TOOLS: readonly { id: ConstraintTool; label: string; mark: string }[] = [
  { id: 'horizontal', label: 'Horizontal', mark: 'H' },
  { id: 'vertical', label: 'Vertical', mark: 'V' },
  { id: 'parallel', label: 'Parallel', mark: '∥' },
  { id: 'perpendicular', label: 'Perpendicular', mark: '⊥' },
  { id: 'angle', label: 'Angle', mark: '∠' },
  { id: 'equal', label: 'Equal', mark: '=' },
  { id: 'tangent', label: 'Tangent', mark: 'T' },
  { id: 'concentric', label: 'Concentric', mark: '◎' },
  { id: 'coincident', label: 'Coincident', mark: '•' },
  { id: 'pointOn', label: 'Point on', mark: '∈' },
  { id: 'midpoint', label: 'Midpoint', mark: 'M' },
  { id: 'symmetric', label: 'Symmetric', mark: '⇋' },
  { id: 'collinear', label: 'Collinear', mark: '⋯' },
  { id: 'equalAngle', label: 'Equal angle', mark: '∠=' },
  { id: 'lengthRatio', label: 'Ratio', mark: '×' },
  { id: 'distance', label: 'Distance', mark: '↔' },
  { id: 'horizontalDistance', label: 'Horizontal distance', mark: '⇔' },
  { id: 'verticalDistance', label: 'Vertical distance', mark: '⇕' },
  { id: 'pointLineDistance', label: 'Distance to line', mark: '⊢' },
  { id: 'reference', label: 'Reference', mark: '( )' },
  { id: 'fix', label: 'Fix', mark: '⚓' },
];

export type ConstrainResult =
  | { ok: true; sketch: Sketch; added: readonly SketchConstraint[] }
  | { ok: false; message: string };

type Line = Extract<SketchPrimitive, { kind: 'line' }>;
type Round = Extract<SketchPrimitive, { kind: 'arc' | 'circle' }>;
type Point = Extract<SketchPrimitive, { kind: 'point' }>;

/** Adds the `tool` relation between the selected primitives, or returns why not. */
export function constrain(
  sketch: Sketch,
  tool: ConstraintTool,
  selected: readonly SketchId[],
): ConstrainResult {
  const picked = selected
    .map((id) => sketch.primitives.find((primitive) => primitive.id === id))
    .filter((primitive): primitive is SketchPrimitive => primitive !== undefined);
  const lines = picked.filter((primitive): primitive is Line => primitive.kind === 'line');
  const rounds = picked.filter(
    (primitive): primitive is Round => primitive.kind === 'arc' || primitive.kind === 'circle',
  );
  const points = picked.filter((primitive): primitive is Point => primitive.kind === 'point');
  const ids = new Ids(sketch);
  const added: SketchConstraint[] = [];

  switch (tool) {
    case 'aligned': {
      // Horizontal/Vertical (Shift+V): each line takes whichever of the two it is closer to.
      if (lines.length === 0) return refuse('Select one or more lines.');
      for (const line of lines) {
        const has = sketch.constraints.some(
          (constraint) =>
            (constraint.kind === 'horizontal' || constraint.kind === 'vertical') &&
            constraint.line === line.id,
        );
        const a = pointAt(sketch, line.start);
        const b = pointAt(sketch, line.end);
        if (has || a === null || b === null) continue;
        const kind = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'horizontal' : 'vertical';
        added.push({ kind, id: ids.next(kind), line: line.id });
      }
      if (added.length === 0) return refuse('Those lines are already horizontal or vertical.');
      break;
    }
    case 'horizontal':
    case 'vertical': {
      const [p, q] = points;
      if (lines.length === 0 && points.length === 2 && p !== undefined && q !== undefined) {
        const kind = tool === 'horizontal' ? 'horizontalPoints' : 'verticalPoints';
        added.push({ kind, id: ids.next(tool), a: p.id, b: q.id });
        break;
      }
      if (lines.length === 0) return refuse('Select one or more lines, or two points.');
      for (const line of lines) {
        const has = sketch.constraints.some(
          (constraint) =>
            (constraint.kind === 'horizontal' || constraint.kind === 'vertical') &&
            constraint.line === line.id,
        );
        if (!has) added.push({ kind: tool, id: ids.next(tool), line: line.id });
      }
      if (added.length === 0) return refuse('Those lines are already horizontal or vertical.');
      break;
    }
    case 'parallel':
    case 'perpendicular': {
      const [a, b] = lines;
      if (lines.length !== 2 || a === undefined || b === undefined) {
        return refuse('Select exactly two lines.');
      }
      added.push({ kind: tool, id: ids.next(tool), a: a.id, b: b.id });
      break;
    }
    case 'angle': {
      // Keeps the current angle between the two lines; its label then accepts a typed value.
      const [a, b] = lines;
      if (lines.length !== 2 || a === undefined || b === undefined) {
        return refuse('Select exactly two lines.');
      }
      const valueRadians = currentAngle(sketch, a.id, b.id);
      if (valueRadians === null) return refuse('Select exactly two lines.');
      const has = sketch.constraints.some(
        (constraint) =>
          constraint.kind === 'angle' &&
          ((constraint.a === a.id && constraint.b === b.id) ||
            (constraint.a === b.id && constraint.b === a.id)),
      );
      if (has) return refuse('Those two lines already have an angle.');
      added.push({ kind: 'angle', id: ids.next('angle'), a: a.id, b: b.id, valueRadians });
      break;
    }
    case 'equal': {
      const pair = lines.length === 2 ? lines : rounds.length === 2 ? rounds : null;
      const [a, b] = pair ?? [];
      if (a === undefined || b === undefined) {
        return refuse('Select two lines, or two circles or arcs.');
      }
      added.push({ kind: 'equal', id: ids.next('equal'), a: a.id, b: b.id });
      break;
    }
    case 'tangent': {
      const [a, b] = picked;
      const fits =
        picked.length === 2 &&
        a !== undefined &&
        b !== undefined &&
        (rounds.length === 2 || (rounds.length === 1 && lines.length === 1));
      if (!fits || a === undefined || b === undefined) {
        return refuse('Select a line and an arc or circle, or two arcs or circles.');
      }
      added.push({ kind: 'tangent', id: ids.next('tangent'), a: a.id, b: b.id });
      break;
    }
    case 'concentric': {
      const [a, b] = rounds;
      if (rounds.length !== 2 || a === undefined || b === undefined) {
        return refuse('Select two circles or arcs.');
      }
      added.push({ kind: 'concentric', id: ids.next('concentric'), a: a.id, b: b.id });
      break;
    }
    case 'coincident': {
      const [a, b] = picked;
      if (picked.length !== 2 || a === undefined || b === undefined) {
        return refuse('Select the two elements whose nearest ends should meet.');
      }
      const pair = nearestEnds(sketch, a, b);
      if (pair === null) return refuse('Those two already share a point.');
      added.push({ kind: 'coincident', id: ids.next('coincident'), a: pair[0], b: pair[1] });
      break;
    }
    case 'pointOn': {
      const [point] = points;
      const [on] = [...lines, ...rounds];
      if (points.length !== 1 || picked.length !== 2 || point === undefined || on === undefined)
        return refuse('Select a point and the line, circle or arc it should lie on.');
      added.push({ kind: 'pointOn', id: ids.next('on'), point: point.id, on: on.id });
      break;
    }
    case 'midpoint': {
      const [point] = points;
      const [line] = lines;
      if (picked.length !== 2 || point === undefined || line === undefined)
        return refuse('Select a point and a line.');
      added.push({ kind: 'midpoint', id: ids.next('mid'), point: point.id, line: line.id });
      break;
    }
    case 'symmetric': {
      // About a line, or about the last picked point; the first two picks are the mirrored pair.
      const [a, b, centre] = points;
      const [axis] = lines;
      const about = axis ?? (points.length === 3 ? centre : undefined);
      const pair =
        axis !== undefined ? points.length === 2 && picked.length === 3 : picked.length === 3;
      if (!pair || a === undefined || b === undefined || about === undefined)
        return refuse('Select two points and the line or point they mirror about.');
      added.push({ kind: 'symmetric', id: ids.next('sym'), a: a.id, b: b.id, about: about.id });
      break;
    }
    case 'equalAngle': {
      // Three lines: the angle from the first to the second equals the one from the second to
      // the third. Four: the first pair's equals the second pair's.
      const [a, b, c, d] = lines;
      if (picked.length !== lines.length || a === undefined || b === undefined || c === undefined)
        return refuse('Select three lines, or two pairs of lines.');
      if (lines.length === 3)
        added.push({ kind: 'equalAngle', id: ids.next('eqa'), a: a.id, b: b.id, c: b.id, d: c.id });
      else if (lines.length === 4 && d !== undefined)
        added.push({ kind: 'equalAngle', id: ids.next('eqa'), a: a.id, b: b.id, c: c.id, d: d.id });
      else return refuse('Select three lines, or two pairs of lines.');
      break;
    }
    case 'lengthRatio': {
      // Keeps the current ratio; its label then accepts a typed value.
      const [a, b] = lines;
      if (lines.length !== 2 || picked.length !== 2 || a === undefined || b === undefined)
        return refuse('Select exactly two lines.');
      const length = (line: Line) => {
        const s0 = pointAt(sketch, line.start);
        const e0 = pointAt(sketch, line.end);
        return s0 === null || e0 === null ? 0 : Math.hypot(e0.x - s0.x, e0.y - s0.y);
      };
      if (length(a) < 1e-9) return refuse('That line has no length.');
      added.push({
        kind: 'lengthRatio',
        id: ids.next('ratio'),
        a: a.id,
        b: b.id,
        ratio: length(b) / length(a),
      });
      break;
    }
    case 'collinear': {
      const [a, b] = lines;
      if (lines.length !== 2 || picked.length !== 2 || a === undefined || b === undefined)
        return refuse('Select exactly two lines.');
      added.push({ kind: 'collinear', id: ids.next('col'), a: a.id, b: b.id });
      break;
    }
    case 'distance':
    case 'horizontalDistance':
    case 'verticalDistance': {
      // Keeps the current measurement; its label then accepts a typed value.
      const [a, b] = points;
      if (points.length !== 2 || picked.length !== 2 || a === undefined || b === undefined)
        return refuse('Select two points.');
      const value =
        tool === 'distance'
          ? Math.hypot(b.x - a.x, b.y - a.y)
          : tool === 'horizontalDistance'
            ? b.x - a.x
            : b.y - a.y;
      added.push({ kind: tool, id: ids.next('dim'), a: a.id, b: b.id, value });
      break;
    }
    case 'pointLineDistance': {
      const [point] = points;
      const [line] = lines;
      const from = line === undefined ? null : pointAt(sketch, line.start);
      const to = line === undefined ? null : pointAt(sketch, line.end);
      if (picked.length !== 2 || point === undefined || line === undefined || !from || !to)
        return refuse('Select a point and a line.');
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length < 1e-9) return refuse('That line has no length.');
      const value =
        Math.abs((to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)) /
        length;
      added.push({
        kind: 'pointLineDistance',
        id: ids.next('dim'),
        point: point.id,
        line: line.id,
        value,
      });
      break;
    }
    case 'reference': {
      // Toggles the picked element's dimension between driving and reference.
      const [only] = picked;
      const own = only === undefined ? undefined : dimensionOf(sketch, only);
      if (picked.length !== 1 || own === undefined)
        return refuse('Select a line or circle that has a dimension.');
      const flipped = { ...own } as SketchConstraint & { reference?: true };
      if (flipped.reference === true) delete flipped.reference;
      else flipped.reference = true;
      return {
        ok: true,
        sketch: {
          ...sketch,
          constraints: sketch.constraints.map((constraint) =>
            constraint.id === own.id ? flipped : constraint,
          ),
        },
        added: [],
      };
    }
    case 'fix': {
      if (picked.length === 0) return refuse('Select what should stay where it is.');
      for (const point of new Set(picked.flatMap(pointsOf))) {
        const at = pointAt(sketch, point);
        const has = sketch.constraints.some(
          (constraint) => constraint.kind === 'lock' && constraint.point === point,
        );
        if (at !== null && !has) {
          added.push({ kind: 'lock', id: ids.next('fix'), point, x: at.x, y: at.y });
        }
      }
      if (added.length === 0) return refuse('That is already fixed.');
      break;
    }
  }
  return { ok: true, sketch: { ...sketch, constraints: [...sketch.constraints, ...added] }, added };
}

/**
 * Records a typed dimension as a constraint, replacing any existing one: a line's length (distance
 * between its ends) or a circle's radius.
 */
export function dimension(sketch: Sketch, target: SketchId, value: number): Sketch {
  const primitive = sketch.primitives.find((candidate) => candidate.id === target);
  if (primitive === undefined || !(value > 0)) return sketch;
  const ids = new Ids(sketch);
  if (primitive.kind === 'line') {
    const same = (constraint: SketchConstraint) =>
      constraint.kind === 'distance' &&
      ((constraint.a === primitive.start && constraint.b === primitive.end) ||
        (constraint.a === primitive.end && constraint.b === primitive.start));
    const kept = sketch.constraints.filter((constraint) => !same(constraint));
    return {
      ...sketch,
      constraints: [
        ...kept,
        { kind: 'distance', id: ids.next('dim'), a: primitive.start, b: primitive.end, value },
      ],
    };
  }
  if (primitive.kind === 'circle' || primitive.kind === 'arc') {
    const kept = sketch.constraints.filter(
      (constraint) =>
        !(
          (constraint.kind === 'radius' || constraint.kind === 'diameter') &&
          constraint.circle === target
        ),
    );
    return {
      ...sketch,
      constraints: [...kept, { kind: 'radius', id: ids.next('dim'), circle: target, value }],
    };
  }
  return sketch;
}

/** The length, radius or diameter constraint an element carries, if it has one. */
export function dimensionOf(
  sketch: Sketch,
  primitive: SketchPrimitive,
): Extract<SketchConstraint, { kind: 'distance' | 'radius' | 'diameter' }> | undefined {
  for (const constraint of sketch.constraints) {
    if (
      primitive.kind === 'line' &&
      constraint.kind === 'distance' &&
      ((constraint.a === primitive.start && constraint.b === primitive.end) ||
        (constraint.a === primitive.end && constraint.b === primitive.start))
    )
      return constraint;
    if (
      (primitive.kind === 'circle' || primitive.kind === 'arc') &&
      (constraint.kind === 'radius' || constraint.kind === 'diameter') &&
      constraint.circle === primitive.id
    )
      return constraint;
  }
  return undefined;
}

/**
 * Sets a typed value for a standalone dimension constraint (horizontal distance, point-to-line
 * distance). Horizontal and vertical ones keep their side: typing 12 into a label reading 12 to the
 * left keeps the point on the left.
 */
export function setConstraintValue(sketch: Sketch, id: SketchId, value: number): Sketch {
  if (!Number.isFinite(value) || value < 0) return sketch;
  return {
    ...sketch,
    constraints: sketch.constraints.map((constraint) => {
      if (constraint.id !== id) return constraint;
      if (constraint.kind === 'horizontalDistance' || constraint.kind === 'verticalDistance')
        return { ...constraint, value: constraint.value < 0 ? -value : value };
      if (constraint.kind === 'lengthRatio')
        return value > 0 ? { ...constraint, ratio: value } : constraint;
      if (
        constraint.kind === 'distance' ||
        constraint.kind === 'pointLineDistance' ||
        constraint.kind === 'radius' ||
        constraint.kind === 'diameter'
      )
        return { ...constraint, value };
      return constraint;
    }),
  };
}

/** Removes a constraint. */
export function unconstrain(sketch: Sketch, id: SketchId): Sketch {
  return {
    ...sketch,
    constraints: sketch.constraints.filter((constraint) => constraint.id !== id),
  };
}

export type SolvedDraft =
  | { ok: true; sketch: Sketch; result: SolveResult }
  | { ok: false; message: string; conflicting: readonly SketchId[] };

/**
 * Solves the sketch and writes the result into it. A contradiction is rejected with the involved
 * constraints named, so the sketch is never left unsatisfiable.
 */
export function solveInto(sketch: Sketch, solver: ConstraintSolver): SolvedDraft {
  let result: SolveResult;
  try {
    result = solver.solve(sketch);
  } catch {
    return { ok: false, message: 'The solver could not read this drawing.', conflicting: [] };
  }
  if (result.status === 'conflicting') {
    const names = result.conflicting.map((id) => describeConstraint(sketch, id));
    return {
      ok: false,
      message: `That contradicts ${names.length > 0 ? names.join(', ') : 'another constraint'}.`,
      conflicting: result.conflicting,
    };
  }
  if (result.status === 'failed') {
    return { ok: false, message: 'The drawing could not be solved with that.', conflicting: [] };
  }
  // planegcs resolves some contradictions by collapsing a line or circle to zero size (e.g. two
  // parallel lines made perpendicular). Treat that as a contradiction; the caller names the cause.
  if (collapses(sketch, result)) {
    return {
      ok: false,
      message: 'That contradicts the constraints already on these lines.',
      conflicting: [],
    };
  }
  return {
    ok: true,
    result,
    sketch: {
      ...sketch,
      primitives: sketch.primitives.map((primitive) => {
        if (primitive.kind === 'point') {
          const at = result.positions.get(primitive.id);
          return at === undefined ? primitive : { ...primitive, x: at.x, y: at.y };
        }
        if (primitive.kind === 'circle') {
          const radius = result.radii.get(primitive.id);
          return radius === undefined ? primitive : { ...primitive, radius };
        }
        return primitive;
      }),
    },
  };
}

/** Whether a solve collapsed a sized line or circle to zero. */
function collapses(sketch: Sketch, result: SolveResult): boolean {
  const at = (id: SketchId, solved: boolean) => {
    if (solved) return result.positions.get(id) ?? null;
    const p = sketch.primitives.find((candidate) => candidate.id === id);
    return p?.kind === 'point' ? { x: p.x, y: p.y } : null;
  };
  const tiny = 1e-6;
  for (const p of sketch.primitives) {
    if (p.kind === 'line') {
      const length = (solved: boolean) => {
        const a = at(p.start, solved);
        const b = at(p.end, solved);
        return a === null || b === null ? null : Math.hypot(b.x - a.x, b.y - a.y);
      };
      const before = length(false);
      const after = length(true);
      if (before !== null && after !== null && before > tiny && after < tiny) return true;
    }
    if (p.kind === 'circle') {
      const after = result.radii.get(p.id);
      if (p.radius > tiny && after !== undefined && after < tiny) return true;
    }
  }
  return false;
}

/** Describes a constraint for messages, e.g. "Horizontal on l3". */
export function describeConstraint(sketch: Sketch, id: SketchId): string {
  const constraint = sketch.constraints.find((candidate) => candidate.id === id);
  if (constraint === undefined) return id;
  const tool = CONSTRAINT_TOOLS.find((entry) => entry.id === constraint.kind);
  const name =
    constraint.kind === 'distance' ||
    constraint.kind === 'horizontalDistance' ||
    constraint.kind === 'verticalDistance' ||
    constraint.kind === 'pointLineDistance'
      ? `the ${round(Math.abs(constraint.value))} mm ${constraint.kind === 'distance' ? 'length' : (tool?.label.toLowerCase() ?? 'distance')}`
      : constraint.kind === 'diameter'
        ? `the ${round(constraint.value)} mm diameter`
        : constraint.kind === 'lengthRatio'
          ? `the ${round(constraint.ratio)}× length ratio`
          : constraint.kind === 'radius'
            ? `the ${round(constraint.value)} mm radius`
            : constraint.kind === 'lock'
              ? 'a fixed point'
              : constraint.kind === 'angle'
                ? `the ${round(shownDegrees(sketch, constraint) ?? 0)}° angle`
                : (tool?.label.toLowerCase() ?? constraint.kind);
  return name;
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function refuse(message: string): ConstrainResult {
  return { ok: false, message };
}

/** Returns a generator of constraint ids unused in the sketch. */
class Ids {
  readonly #taken: Set<SketchId>;
  constructor(sketch: Sketch) {
    this.#taken = new Set([
      ...sketch.primitives.map((primitive) => primitive.id),
      ...sketch.constraints.map((constraint) => constraint.id),
    ]);
  }
  next(prefix: string): SketchId {
    let n = 1;
    while (this.#taken.has(`${prefix}${n}`)) n += 1;
    const id = `${prefix}${n}`;
    this.#taken.add(id);
    return id;
  }
}

function endsOf(primitive: SketchPrimitive): SketchId[] {
  if (primitive.kind === 'arc') return [primitive.start, primitive.end];
  if (primitive.kind === 'spline') {
    const first = primitive.points[0];
    const last = primitive.points[primitive.points.length - 1];
    return primitive.closed === true || first === undefined || last === undefined
      ? []
      : [first, last];
  }
  if (primitive.kind === 'ellipse') return [];
  return pointsOf(primitive);
}

function pointAt(sketch: Sketch, id: SketchId): { x: number; y: number } | null {
  const point = sketch.primitives.find((primitive) => primitive.id === id);
  return point?.kind === 'point' ? { x: point.x, y: point.y } : null;
}

/** The closest pair of ends between two elements, or null when they share one. */
function nearestEnds(
  sketch: Sketch,
  a: SketchPrimitive,
  b: SketchPrimitive,
): [SketchId, SketchId] | null {
  let best: { pair: [SketchId, SketchId]; distance: number } | null = null;
  for (const p of endsOf(a)) {
    for (const q of endsOf(b)) {
      if (p === q) return null;
      const pa = pointAt(sketch, p);
      const qa = pointAt(sketch, q);
      if (pa === null || qa === null) continue;
      const distance = Math.hypot(pa.x - qa.x, pa.y - qa.y);
      if (best === null || distance < best.distance) best = { pair: [p, q], distance };
    }
  }
  return best?.pair ?? null;
}
