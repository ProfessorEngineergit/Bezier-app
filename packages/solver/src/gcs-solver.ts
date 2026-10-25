/**
 * Translates a `Sketch` into planegcs calls and the result back into a `SolveResult`.
 *
 * - Order: planegcs resolves a line's points when the line is pushed, so points go first, then
 *   lines/circles/arcs, then constraints.
 * - Ids: one of our constraints can become several planegcs objects (`lock` is two, an arc adds a
 *   rule); their ids map back so conflicts name the user's constraint.
 * - Status: a contradiction comes back as `Failed`, so conflicts are checked first.
 * - Arcs: ours are three points; planegcs adds a radius and two angles tied by `arc_rules`.
 *
 * Reference dimensions are not passed to planegcs (its non-driving constraints are buggy upstream,
 * see the README); callers measure them.
 */

import type {
  ConstraintSolver,
  Point2,
  Sketch,
  SketchConstraint,
  SketchId,
  SketchPoint,
  SketchPrimitive,
  SolveResult,
  SolveStatus,
} from './index.js';
import { DebugMode, GcsSolveStatus, type GcsWrapper } from './wasm.js';

/** planegcs's type for "one geometry or one constraint", named without importing it (ADR 0004). */
type GcsPrimitive = Parameters<GcsWrapper['push_primitive']>[0];
type Kind = SketchPrimitive['kind'];
type ById = ReadonlyMap<SketchId, SketchPrimitive>;
/** planegcs id -> the id of our constraint or arc it was created for. */
type Owners = Map<string, SketchId>;

/** Returns the primitive for an id; throws on a dangling id. */
function need(byId: ById, id: SketchId): SketchPrimitive {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`The sketch refers to "${id}", which does not exist.`);
  return found;
}

function pointOf(byId: ById, id: SketchId): SketchPoint {
  const found = need(byId, id);
  if (found.kind !== 'point') {
    throw new Error(`"${id}" is a ${found.kind}, but a point is needed here.`);
  }
  return found;
}

/** The centre of a circle or arc. planegcs has no "concentric"; centres are made coincident. */
function centreOf(byId: ById, id: SketchId): SketchId {
  const found = need(byId, id);
  if (found.kind === 'circle' || found.kind === 'arc') return found.center;
  throw new Error(`"${id}" is a ${found.kind}, which has no centre.`);
}

function lineLength(byId: ById, line: SketchPrimitive & { kind: 'line' }): number {
  const a = pointOf(byId, line.start);
  const b = pointOf(byId, line.end);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The signed angle from one line's direction to another's, as `l2l_angle_ll` measures it. */
function lineAngle(byId: ById, from: SketchId, to: SketchId): number {
  const direction = (id: SketchId) => {
    const line = need(byId, id);
    if (line.kind !== 'line') throw new Error(`"${id}" is a ${line.kind}, not a line.`);
    const a = pointOf(byId, line.start);
    const b = pointOf(byId, line.end);
    return { x: b.x - a.x, y: b.y - a.y };
  };
  const u = direction(from);
  const v = direction(to);
  return Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
}

interface Ref {
  id: SketchId;
  kind: Kind;
}

/** Lines before circles before arcs. */
const RANK: Record<Kind, number> = { point: 0, line: 1, circle: 2, arc: 3, spline: 4, ellipse: 5 };

/**
 * Sorts a pair into planegcs order (line, circle, arc), so `tangent` and `equal`, which planegcs
 * splits per pair of kinds, need one case per pair.
 */
function ordered(byId: ById, a: SketchId, b: SketchId): [Ref, Ref] {
  const first: Ref = { id: a, kind: need(byId, a).kind };
  const second: Ref = { id: b, kind: need(byId, b).kind };
  return RANK[first.kind] <= RANK[second.kind] ? [first, second] : [second, first];
}

function pushPrimitive(
  gcs: GcsWrapper,
  primitive: SketchPrimitive,
  byId: ById,
  owners: Owners,
): void {
  switch (primitive.kind) {
    case 'point':
      gcs.push_primitive({
        id: primitive.id,
        type: 'point',
        x: primitive.x,
        y: primitive.y,
        // Optional for us, required for planegcs.
        fixed: primitive.fixed === true,
      });
      return;
    case 'line':
      gcs.push_primitive({
        id: primitive.id,
        type: 'line',
        p1_id: primitive.start,
        p2_id: primitive.end,
      });
      return;
    case 'circle':
      gcs.push_primitive({
        id: primitive.id,
        type: 'circle',
        c_id: primitive.center,
        radius: primitive.radius,
      });
      return;
    case 'arc': {
      const centre = pointOf(byId, primitive.center);
      const start = pointOf(byId, primitive.start);
      const end = pointOf(byId, primitive.end);
      // Angles are periodic to planegcs (arc_rules uses cos/sin), so an arc across the -x axis
      // needs no adjustment.
      const startAngle = Math.atan2(start.y - centre.y, start.x - centre.x);
      const endAngle = Math.atan2(end.y - centre.y, end.x - centre.x);
      gcs.push_primitive({
        id: primitive.id,
        type: 'arc',
        c_id: primitive.center,
        start_id: primitive.start,
        end_id: primitive.end,
        radius: Math.hypot(start.x - centre.x, start.y - centre.y),
        start_angle: startAngle,
        end_angle: endAngle,
      });
      // Ties the three points to the radius and angles.
      const rules = `${primitive.id}#rules`;
      owners.set(rules, primitive.id);
      gcs.push_primitive({ id: rules, type: 'arc_rules', a_id: primitive.id, driving: true });
      return;
    }
    case 'spline':
    case 'ellipse':
      // Only their points are solved; the curve is drawn through them, and the ellipse's minor
      // axis is kept as given.
      return;
    default: {
      const unreachable: never = primitive;
      throw new Error(`Unknown primitive: ${JSON.stringify(unreachable)}`);
    }
  }
}

/** The planegcs "equal" constraint for this pair of kinds. */
function equalOf(id: SketchId, x: Ref, y: Ref): GcsPrimitive {
  switch (`${x.kind}+${y.kind}`) {
    case 'line+line':
      return { id, type: 'equal_length', l1_id: x.id, l2_id: y.id, driving: true };
    case 'circle+circle':
      return { id, type: 'equal_radius_cc', c1_id: x.id, c2_id: y.id, driving: true };
    case 'circle+arc':
      return { id, type: 'equal_radius_ca', c1_id: x.id, a2_id: y.id, driving: true };
    case 'arc+arc':
      return { id, type: 'equal_radius_aa', a1_id: x.id, a2_id: y.id, driving: true };
    default:
      throw new Error(`"equal" cannot relate a ${x.kind} to a ${y.kind}.`);
  }
}

/** The planegcs tangency constraint for this pair of kinds. */
function tangentOf(id: SketchId, x: Ref, y: Ref): GcsPrimitive {
  switch (`${x.kind}+${y.kind}`) {
    case 'line+circle':
      return { id, type: 'tangent_lc', l_id: x.id, c_id: y.id, driving: true };
    case 'line+arc':
      return { id, type: 'tangent_la', l_id: x.id, a_id: y.id, driving: true };
    case 'circle+circle':
      return { id, type: 'tangent_cc', c1_id: x.id, c2_id: y.id, driving: true };
    case 'circle+arc':
      return { id, type: 'tangent_ca', c_id: x.id, a_id: y.id, driving: true };
    case 'arc+arc':
      return { id, type: 'tangent_aa', a1_id: x.id, a2_id: y.id, driving: true };
    default:
      throw new Error(`"tangent" cannot relate a ${x.kind} to a ${y.kind}.`);
  }
}

function pushConstraint(gcs: GcsWrapper, c: SketchConstraint, byId: ById, owners: Owners): void {
  switch (c.kind) {
    case 'coincident':
      gcs.push_primitive({
        id: c.id,
        type: 'p2p_coincident',
        p1_id: c.a,
        p2_id: c.b,
        driving: true,
      });
      return;
    case 'horizontal':
      gcs.push_primitive({ id: c.id, type: 'horizontal_l', l_id: c.line, driving: true });
      return;
    case 'vertical':
      gcs.push_primitive({ id: c.id, type: 'vertical_l', l_id: c.line, driving: true });
      return;
    case 'parallel':
      gcs.push_primitive({ id: c.id, type: 'parallel', l1_id: c.a, l2_id: c.b, driving: true });
      return;
    case 'perpendicular':
      gcs.push_primitive({
        id: c.id,
        type: 'perpendicular_ll',
        l1_id: c.a,
        l2_id: c.b,
        driving: true,
      });
      return;
    case 'concentric':
      gcs.push_primitive({
        id: c.id,
        type: 'p2p_coincident',
        p1_id: centreOf(byId, c.a),
        p2_id: centreOf(byId, c.b),
        driving: true,
      });
      return;
    case 'distance':
      gcs.push_primitive({
        id: c.id,
        type: 'p2p_distance',
        p1_id: c.a,
        p2_id: c.b,
        distance: c.value,
        driving: true,
      });
      return;
    case 'angle':
      gcs.push_primitive({
        id: c.id,
        type: 'l2l_angle_ll',
        l1_id: c.a,
        l2_id: c.b,
        angle: c.valueRadians,
        driving: true,
      });
      return;
    case 'pointOn': {
      const on = need(byId, c.on);
      if (on.kind === 'line')
        gcs.push_primitive({
          id: c.id,
          type: 'point_on_line_pl',
          p_id: c.point,
          l_id: c.on,
          driving: true,
        });
      else if (on.kind === 'circle')
        gcs.push_primitive({
          id: c.id,
          type: 'point_on_circle',
          p_id: c.point,
          c_id: c.on,
          driving: true,
        });
      else if (on.kind === 'arc')
        gcs.push_primitive({
          id: c.id,
          type: 'point_on_arc',
          p_id: c.point,
          a_id: c.on,
          driving: true,
        });
      else throw new Error(`"${c.on}" is a point, which nothing can lie on.`);
      return;
    }
    case 'midpoint': {
      const line = need(byId, c.line);
      if (line.kind !== 'line') throw new Error(`"${c.line}" is a ${line.kind}, not a line.`);
      // Midpoint: the line's ends are symmetric about the point.
      gcs.push_primitive({
        id: c.id,
        type: 'p2p_symmetric_ppp',
        p1_id: line.start,
        p2_id: line.end,
        p_id: c.point,
        driving: true,
      });
      return;
    }
    case 'symmetric':
      gcs.push_primitive(
        need(byId, c.about).kind === 'line'
          ? {
              id: c.id,
              type: 'p2p_symmetric_ppl',
              p1_id: c.a,
              p2_id: c.b,
              l_id: c.about,
              driving: true,
            }
          : {
              id: c.id,
              type: 'p2p_symmetric_ppp',
              p1_id: c.a,
              p2_id: c.b,
              p_id: c.about,
              driving: true,
            },
      );
      return;
    case 'collinear': {
      // Parallel plus one end on the other line; planegcs has no collinear constraint.
      const second = need(byId, c.b);
      if (second.kind !== 'line') throw new Error(`"${c.b}" is a ${second.kind}, not a line.`);
      owners.set(`${c.id}#on`, c.id);
      gcs.push_primitive({ id: c.id, type: 'parallel', l1_id: c.a, l2_id: c.b, driving: true });
      gcs.push_primitive({
        id: `${c.id}#on`,
        type: 'point_on_line_pl',
        p_id: second.start,
        l_id: c.a,
        driving: true,
      });
      return;
    }
    case 'horizontalPoints':
    case 'verticalPoints':
      gcs.push_primitive({
        id: c.id,
        type: c.kind === 'horizontalPoints' ? 'horizontal_pp' : 'vertical_pp',
        p1_id: c.a,
        p2_id: c.b,
        driving: true,
      });
      return;
    case 'equalAngle': {
      // planegcs has no "equal angle": both pairs share one free angle parameter, initialised from
      // the first pair.
      const angle = `${c.id}#angle`;
      gcs.push_sketch_param(angle, lineAngle(byId, c.a, c.b), false);
      owners.set(`${c.id}#second`, c.id);
      gcs.push_primitive({
        id: c.id,
        type: 'l2l_angle_ll',
        l1_id: c.a,
        l2_id: c.b,
        angle,
        driving: true,
      });
      gcs.push_primitive({
        id: `${c.id}#second`,
        type: 'l2l_angle_ll',
        l1_id: c.c,
        l2_id: c.d,
        angle,
        driving: true,
      });
      return;
    }
    case 'lengthRatio': {
      // planegcs's `proportional` between two free lengths drops the ratio (every algorithm,
      // either order). Built instead from similar triangles in hidden helper geometry: a run as
      // long as line a, a ray of slope `ratio`, and line b as long as the rise.
      const first = need(byId, c.a);
      const second = need(byId, c.b);
      if (first.kind !== 'line' || second.kind !== 'line')
        throw new Error('A length ratio is between two lines.');
      const run = lineLength(byId, first);
      const h = (name: string) => {
        const id = `${c.id}#${name}`;
        owners.set(id, c.id);
        return id;
      };
      const o = h('o');
      const u = h('u');
      const q = h('q');
      const p = h('p');
      const top = h('t');
      const oq = h('oq');
      const ou = h('ou');
      const op = h('ot');
      gcs.push_primitive({ id: o, type: 'point', x: 0, y: 0, fixed: true });
      gcs.push_primitive({ id: u, type: 'point', x: 1, y: c.ratio, fixed: true });
      gcs.push_primitive({ id: q, type: 'point', x: run, y: 0, fixed: false });
      gcs.push_primitive({ id: p, type: 'point', x: run, y: run * c.ratio, fixed: false });
      gcs.push_primitive({ id: top, type: 'point', x: 0, y: run * c.ratio, fixed: false });
      gcs.push_primitive({ id: oq, type: 'line', p1_id: o, p2_id: q });
      gcs.push_primitive({ id: ou, type: 'line', p1_id: o, p2_id: u });
      gcs.push_primitive({ id: op, type: 'line', p1_id: o, p2_id: top });
      gcs.push_primitive({
        id: h('run'),
        type: 'equal_length',
        l1_id: c.a,
        l2_id: oq,
        driving: true,
      });
      gcs.push_primitive({
        id: h('flat'),
        type: 'horizontal_pp',
        p1_id: o,
        p2_id: q,
        driving: true,
      });
      gcs.push_primitive({ id: h('up'), type: 'vertical_pp', p1_id: q, p2_id: p, driving: true });
      gcs.push_primitive({
        id: h('ray'),
        type: 'point_on_line_pl',
        p_id: p,
        l_id: ou,
        driving: true,
      });
      gcs.push_primitive({
        id: h('level'),
        type: 'horizontal_pp',
        p1_id: p,
        p2_id: top,
        driving: true,
      });
      gcs.push_primitive({
        id: h('axis'),
        type: 'vertical_pp',
        p1_id: o,
        p2_id: top,
        driving: true,
      });
      gcs.push_primitive({ id: c.id, type: 'equal_length', l1_id: c.b, l2_id: op, driving: true });
      return;
    }
    case 'horizontalDistance':
    case 'verticalDistance': {
      const prop = c.kind === 'horizontalDistance' ? 'x' : 'y';
      gcs.push_primitive({
        id: c.id,
        type: 'difference',
        param1: { o_id: c.a, prop },
        param2: { o_id: c.b, prop },
        difference: c.value,
        driving: true,
      });
      return;
    }
    case 'pointLineDistance':
      gcs.push_primitive({
        id: c.id,
        type: 'p2l_distance',
        p_id: c.point,
        l_id: c.line,
        distance: c.value,
        driving: true,
      });
      return;
    case 'diameter':
      gcs.push_primitive(
        need(byId, c.circle).kind === 'arc'
          ? { id: c.id, type: 'arc_diameter', a_id: c.circle, diameter: c.value, driving: true }
          : { id: c.id, type: 'circle_diameter', c_id: c.circle, diameter: c.value, driving: true },
      );
      return;
    case 'radius':
      gcs.push_primitive(
        need(byId, c.circle).kind === 'arc'
          ? { id: c.id, type: 'arc_radius', a_id: c.circle, radius: c.value, driving: true }
          : { id: c.id, type: 'circle_radius', c_id: c.circle, radius: c.value, driving: true },
      );
      return;
    case 'equal': {
      const [x, y] = ordered(byId, c.a, c.b);
      gcs.push_primitive(equalOf(c.id, x, y));
      return;
    }
    case 'tangent': {
      const [x, y] = ordered(byId, c.a, c.b);
      gcs.push_primitive(tangentOf(c.id, x, y));
      return;
    }
    case 'lock':
      // One planegcs constraint per axis.
      owners.set(`${c.id}#x`, c.id);
      owners.set(`${c.id}#y`, c.id);
      gcs.push_primitive({
        id: `${c.id}#x`,
        type: 'coordinate_x',
        p_id: c.point,
        x: c.x,
        driving: true,
      });
      gcs.push_primitive({
        id: `${c.id}#y`,
        type: 'coordinate_y',
        p_id: c.point,
        y: c.y,
        driving: true,
      });
      return;
    default: {
      const unreachable: never = c;
      throw new Error(`Unknown constraint: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * Maps a solve to our status. Conflicts are checked first because planegcs reports them as
 * `Failed`. `Converged` (smallest error found, typical with redundancy) is not a failure.
 */
function statusOf(outcome: number, conflicting: boolean, dof: number): SolveStatus {
  if (conflicting) return 'conflicting';
  if (outcome === GcsSolveStatus.Failed || outcome === GcsSolveStatus.SuccessfulSolutionInvalid) {
    return 'failed';
  }
  return dof > 0 ? 'under-constrained' : 'solved';
}

/** Copies solved values out of planegcs into our own objects. */
function readBack(gcs: GcsWrapper, sketch: Sketch) {
  const positions = new Map<SketchId, Point2>();
  const radii = new Map<SketchId, number>();
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'point') {
      const solved = gcs.sketch_index.get_sketch_point(primitive.id);
      positions.set(primitive.id, { x: solved.x, y: solved.y });
    } else if (primitive.kind === 'circle') {
      radii.set(primitive.id, gcs.sketch_index.get_sketch_circle(primitive.id).radius);
    } else if (primitive.kind === 'arc') {
      radii.set(primitive.id, gcs.sketch_index.get_sketch_arc(primitive.id).radius);
    }
  }
  return { positions, radii };
}

/**
 * Wraps a loaded `GcsWrapper` as a `ConstraintSolver`. Each `solve()` is stateless and starts from
 * the sketch's current coordinates.
 */
export function createGcsSolver(gcs: GcsWrapper): ConstraintSolver {
  // The default logs "Sketcher Redundant solving: …" on every conflict or redundancy.
  gcs.debug_mode = DebugMode.NoDebug;

  return {
    solve(sketch: Sketch): SolveResult {
      const byId: ById = new Map(sketch.primitives.map((p) => [p.id, p]));
      const owners: Owners = new Map();
      const ours = (id: string): SketchId => owners.get(id) ?? id;

      // Without this the second solve throws "object with id … already exists".
      gcs.clear_data();
      for (const p of sketch.primitives) {
        if (p.kind === 'point') pushPrimitive(gcs, p, byId, owners);
      }
      for (const p of sketch.primitives) {
        if (p.kind !== 'point') pushPrimitive(gcs, p, byId, owners);
      }
      for (const c of sketch.constraints) {
        if ('reference' in c && c.reference === true) continue;
        pushConstraint(gcs, c, byId, owners);
      }

      const outcome = gcs.solve();
      const dof = gcs.gcs.dof();
      // Map back to our ids and deduplicate (both halves of a lock are reported).
      const conflicting = [...new Set(gcs.get_gcs_conflicting_constraints().map(ours))];
      const redundant = [...new Set(gcs.get_gcs_redundant_constraints().map(ours))];
      const status = statusOf(outcome, gcs.has_gcs_conflicting_constraints(), dof);

      // Values after a failed solve are meaningless.
      if (status === 'failed') {
        return { status, positions: new Map(), radii: new Map(), dof, conflicting, redundant };
      }
      gcs.apply_solution();
      return { status, ...readBack(gcs, sketch), dof, conflicting, redundant };
    },

    determined(sketch: Sketch): ReadonlySet<SketchId> {
      const byId: ById = new Map(sketch.primitives.map((p) => [p.id, p]));
      const held = new Set<SketchId>();
      const load = () => {
        gcs.clear_data();
        for (const p of sketch.primitives)
          if (p.kind === 'point') pushPrimitive(gcs, p, byId, new Map());
        for (const p of sketch.primitives)
          if (p.kind !== 'point') pushPrimitive(gcs, p, byId, new Map());
        for (const c of sketch.constraints)
          if (!('reference' in c && c.reference === true)) pushConstraint(gcs, c, byId, new Map());
      };
      // Nothing is determined while the sketch cannot be solved.
      load();
      const outcome = gcs.solve();
      if (gcs.has_gcs_conflicting_constraints() || outcome === GcsSolveStatus.Failed) return held;
      const everything = gcs.gcs.dof() === 0;
      // An element is determined when pinning its points and radius adds only redundant
      // constraints. Pins go last so the solver reports them, not the sketch's, as redundant.
      const pointHeld = new Map<SketchId, boolean>();
      const pinned = (points: readonly SketchId[], radius: SketchId | null): boolean => {
        if (everything) return true;
        load();
        const pins: string[] = [];
        for (const id of points) {
          const at = pointOf(byId, id);
          if (at.fixed === true) continue;
          pins.push(`pin#${id}#x`, `pin#${id}#y`);
          gcs.push_primitive({
            id: `pin#${id}#x`,
            type: 'coordinate_x',
            p_id: id,
            x: at.x,
            driving: true,
          });
          gcs.push_primitive({
            id: `pin#${id}#y`,
            type: 'coordinate_y',
            p_id: id,
            y: at.y,
            driving: true,
          });
        }
        if (radius !== null) {
          const round = need(byId, radius);
          const value =
            round.kind === 'circle'
              ? round.radius
              : round.kind === 'arc'
                ? Math.hypot(
                    pointOf(byId, round.start).x - pointOf(byId, round.center).x,
                    pointOf(byId, round.start).y - pointOf(byId, round.center).y,
                  )
                : 0;
          pins.push(`pin#${radius}#r`);
          gcs.push_primitive(
            round.kind === 'arc'
              ? {
                  id: `pin#${radius}#r`,
                  type: 'arc_radius',
                  a_id: radius,
                  radius: value,
                  driving: true,
                }
              : {
                  id: `pin#${radius}#r`,
                  type: 'circle_radius',
                  c_id: radius,
                  radius: value,
                  driving: true,
                },
          );
        }
        if (pins.length === 0) return true;
        gcs.solve();
        const redundant = new Set([
          ...gcs.get_gcs_redundant_constraints(),
          ...gcs.get_gcs_partially_redundant_constraints(),
        ]);
        return pins.every((pin) => redundant.has(pin));
      };
      const pointIsHeld = (id: SketchId) => {
        const known = pointHeld.get(id);
        if (known !== undefined) return known;
        const answer = pinned([id], null);
        pointHeld.set(id, answer);
        return answer;
      };
      for (const p of sketch.primitives) {
        if (p.kind === 'point') {
          if (pointIsHeld(p.id)) held.add(p.id);
        } else if (p.kind === 'line') {
          if (pointIsHeld(p.start) && pointIsHeld(p.end)) held.add(p.id);
        } else if (p.kind === 'circle') {
          if (pointIsHeld(p.center) && pinned([p.center], p.id)) held.add(p.id);
        } else if (p.kind === 'arc') {
          if (pointIsHeld(p.center) && pointIsHeld(p.start) && pointIsHeld(p.end)) held.add(p.id);
        } else if (p.kind === 'spline') {
          if (p.points.every(pointIsHeld)) held.add(p.id);
        } else if (pointIsHeld(p.center) && pointIsHeld(p.vertex)) {
          held.add(p.id);
        }
      }
      return held;
    },

    dispose() {
      gcs.destroy_gcs_module();
    },
  };
}
