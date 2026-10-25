/**
 * A rough outline of a STEP file read from its text in seconds, shown while OCCT reads the file
 * (about a minute for the 241 MB Voron in Node). Edges are drawn as lines, arcs or control
 * polygons, placed through the assembly structure. Unknown entities are skipped, untraceable
 * curves drawn as chords, and unplaceable parts drawn where defined.
 */

import { refsIn } from './step-colors.js';
import type { Bounds, EdgeSet } from './types.js';

/** Segments a full circle is drawn with; an arc gets its share. */
const CIRCLE_SEGMENTS = 24;

type Matrix = readonly number[]; // 3×4, row-major: [r00 r01 r02 tx, r10 …]
const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

interface Parsed {
  xyz: Map<number, [number, number, number]>;
  placements: Map<number, [number, number, number]>;
  vertices: Map<number, number>;
  edges: Map<number, { from: number; to: number; curve: number; sense: boolean }>;
  circles: Map<number, { at: number; r1: number; r2: number }>;
  splines: Map<number, number[]>;
  /** A curve that wraps another: a surface curve's 3D curve, a trimmed curve's basis. */
  wraps: Map<number, number>;
  lists: Map<number, number[]>;
  reps: Map<number, number[]>;
  same: [number, number][];
  moved: { child: number; parent: number; how: number }[];
  transforms: Map<number, [number, number]>;
  mapped: Map<number, [number, number]>;
  maps: Map<number, [number, number]>;
  breps: Set<number>;
  scale: number;
}

/** The numbers of a statement's first inner list: a point's coordinates. */
function coordinates(args: string): [number, number, number] {
  const open = args.indexOf('(', 1);
  const parts = args.slice(open + 1, args.indexOf(')', open)).split(',');
  return [Number(parts[0] ?? 0), Number(parts[1] ?? 0), Number(parts[2] ?? 0)];
}

type Handler = (p: Parsed, id: number, args: string) => void;

const holder: Handler = (p, id, args) => p.lists.set(id, refsIn(args));
const brep: Handler = (p, id, args) => {
  p.breps.add(id);
  p.lists.set(id, refsIn(args));
};
const face: Handler = (p, id, args) => p.lists.set(id, firstList(args));
const representation: Handler = (p, id, args) => p.reps.set(id, firstList(args));
const spline: Handler = (p, id, args) =>
  p.splines.set(id, refsIn(args.slice(0, args.indexOf(')') + 1)));
const conic: Handler = (p, id, args) => {
  const [at] = refsIn(args);
  const parts = args.slice(args.indexOf(',', args.indexOf('#')) + 1).split(',');
  const r1 = Number.parseFloat(parts[0] ?? '');
  const r2 = parts.length > 1 ? Number.parseFloat(parts[1] ?? '') : r1;
  if (at !== undefined && r1 > 0) p.circles.set(id, { at, r1, r2: r2 > 0 ? r2 : r1 });
};

const wrapper: Handler = (p, id, args) => {
  const [inner] = refsIn(args);
  if (inner !== undefined) p.wraps.set(id, inner);
};

/** Handlers by entity type; a map lookup since the Voron has seven million statements. */
const HANDLERS = new Map<string, Handler>([
  ['CARTESIAN_POINT', (p, id, args) => p.xyz.set(id, coordinates(args))],
  ['DIRECTION', (p, id, args) => p.xyz.set(id, coordinates(args))],
  [
    'VERTEX_POINT',
    (p, id, args) => {
      const [point] = refsIn(args);
      if (point !== undefined) p.vertices.set(id, point);
    },
  ],
  [
    'EDGE_CURVE',
    (p, id, args) => {
      const [from, to, curve] = refsIn(args);
      if (from === undefined || to === undefined || curve === undefined) return;
      p.edges.set(id, { from, to, curve, sense: !args.endsWith('.F.)') });
    },
  ],
  ['SURFACE_CURVE', wrapper],
  ['SEAM_CURVE', wrapper],
  ['INTERSECTION_CURVE', wrapper],
  ['TRIMMED_CURVE', wrapper],
  ['CIRCLE', conic],
  ['ELLIPSE', conic],
  ['B_SPLINE_CURVE_WITH_KNOTS', spline],
  ['B_SPLINE_CURVE', spline],
  [
    'AXIS2_PLACEMENT_3D',
    (p, id, args) => {
      const [at = 0, axis = 0, ref = 0] = refsOrZero(args);
      p.placements.set(id, [at, axis, ref]);
    },
  ],
  ['MANIFOLD_SOLID_BREP', brep],
  ['BREP_WITH_VOIDS', brep],
  ['CLOSED_SHELL', holder],
  ['OPEN_SHELL', holder],
  ['ADVANCED_FACE', face],
  ['FACE_SURFACE', face],
  ['FACE_BOUND', holder],
  ['FACE_OUTER_BOUND', holder],
  ['EDGE_LOOP', holder],
  ['ORIENTED_EDGE', holder],
  ['SHAPE_REPRESENTATION', representation],
  ['ADVANCED_BREP_SHAPE_REPRESENTATION', representation],
  ['MANIFOLD_SURFACE_SHAPE_REPRESENTATION', representation],
  ['FACETED_BREP_SHAPE_REPRESENTATION', representation],
  [
    'SHAPE_REPRESENTATION_RELATIONSHIP',
    (p, _id, args) => {
      const [a, b] = refsIn(args);
      if (a !== undefined && b !== undefined) p.same.push([a, b]);
    },
  ],
  [
    'ITEM_DEFINED_TRANSFORMATION',
    (p, id, args) => {
      const [a, b] = refsIn(args);
      if (a !== undefined && b !== undefined) p.transforms.set(id, [a, b]);
    },
  ],
  [
    'MAPPED_ITEM',
    (p, id, args) => {
      const [map, target] = refsIn(args);
      if (map !== undefined && target !== undefined) p.mapped.set(id, [map, target]);
    },
  ],
  [
    'REPRESENTATION_MAP',
    (p, id, args) => {
      const [origin, rep] = refsIn(args);
      if (origin !== undefined && rep !== undefined) p.maps.set(id, [origin, rep]);
    },
  ],
]);

function parse(text: string): Parsed {
  const p: Parsed = {
    xyz: new Map(),
    placements: new Map(),
    vertices: new Map(),
    edges: new Map(),
    circles: new Map(),
    splines: new Map(),
    wraps: new Map(),
    lists: new Map(),
    reps: new Map(),
    same: [],
    moved: [],
    transforms: new Map(),
    mapped: new Map(),
    maps: new Map(),
    breps: new Set(),
    scale: 1,
  };
  // Millimetres unless the file says otherwise. A file lists several unit contexts, and a
  // metre among them (for a mass or an angle's context) does not make its lengths metres.
  const units = text.slice(0, 200_000) + text.slice(-2_000_000);
  if (!/SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(units)) {
    if (/SI_UNIT\(\$,\.METRE\.\)/.test(units)) p.scale = 1000;
    else if (/SI_UNIT\(\.CENTI\.,\.METRE\.\)/.test(units)) p.scale = 10;
    else if (/'INCH'/i.test(units)) p.scale = 25.4;
  }

  // Statements are found with `indexOf`, not char by char (files reach 250 MB). A `;` inside a
  // quoted name does not end one.
  let start = 0;
  let quoted = false;
  let quote = text.indexOf("'");
  let semicolon = text.indexOf(';');
  while (semicolon !== -1) {
    // Quotes before this `;` tell whether it is inside a name. Each is counted once as the scan
    // passes; recounting per `;` is quadratic.
    while (quote !== -1 && quote < semicolon) {
      quoted = !quoted;
      quote = text.indexOf("'", quote + 1);
    }
    if (!quoted) {
      statement(p, text, start, semicolon);
      start = semicolon + 1;
    }
    semicolon = text.indexOf(';', semicolon + 1);
  }
  return p;
}

function statement(p: Parsed, text: string, start: number, end: number): void {
  const hash = text.indexOf('#', start);
  if (hash === -1 || hash > end) return;
  const equals = text.indexOf('=', hash);
  if (equals === -1 || equals > end) return;
  let k = equals + 1;
  while (k < end && text.charCodeAt(k) <= 32) k++;
  const id = Number(text.slice(hash + 1, equals));
  if (text.charCodeAt(k) === 40) {
    complex(p, id, text.slice(k, end));
    return;
  }
  const open = text.indexOf('(', k);
  if (open === -1 || open > end) return;
  const handler = HANDLERS.get(text.slice(k, open).trimEnd());
  if (handler !== undefined) handler(p, id, text.slice(open, end));
}

function complex(p: Parsed, id: number, body: string): void {
  const spline = body.indexOf('B_SPLINE_CURVE(');
  if (spline !== -1) {
    const from = body.indexOf('(', body.indexOf('(', spline) + 1);
    p.splines.set(id, refsIn(body.slice(from, body.indexOf(')', from) + 1)));
    return;
  }
  // The plain relationship, not the `SHAPE_…` one the same entity also lists.
  const relation = body.search(/(?<![A-Z_])REPRESENTATION_RELATIONSHIP\(/);
  const how = body.indexOf('REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(');
  if (relation === -1) return;
  const [child, parent] = refsIn(body.slice(relation, body.indexOf(')', relation)));
  if (child === undefined || parent === undefined) return;
  if (how === -1) {
    p.same.push([child, parent]);
    return;
  }
  const [transform] = refsIn(body.slice(how, body.indexOf(')', how)));
  if (transform !== undefined) p.moved.push({ child, parent, how: transform });
}

/** The references of the first parenthesised list: a face's bounds, a representation's items. */
function firstList(args: string): number[] {
  const open = args.indexOf('(', 1);
  return open === -1 ? [] : refsIn(args.slice(open, args.indexOf(')', open) + 1));
}

/** Positional references, with 0 where the file leaves one out (`$`). */
function refsOrZero(args: string): number[] {
  return args
    .slice(args.indexOf(',') + 1)
    .split(',')
    .map((part) => {
      const hash = part.indexOf('#');
      return hash === -1 ? 0 : Number.parseInt(part.slice(hash + 1), 10);
    });
}

function frame(p: Parsed, placement: number): Matrix {
  const [at, axis, ref] = p.placements.get(placement) ?? [0, 0, 0];
  const o = p.xyz.get(at) ?? [0, 0, 0];
  const z = unit(p.xyz.get(axis) ?? [0, 0, 1]);
  let x = p.xyz.get(ref) ?? (Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  const d = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
  x = unit([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]);
  const y: [number, number, number] = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  return [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]];
}

function unit(v: readonly number[]): [number, number, number] {
  const [a = 0, b = 0, c = 0] = v;
  const length = Math.hypot(a, b, c) || 1;
  return [a / length, b / length, c / length];
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = c === 3 ? (a[r * 4 + 3] ?? 0) : 0;
      for (let k = 0; k < 3; k++) sum += (a[r * 4 + k] ?? 0) * (b[k * 4 + c] ?? 0);
      out.push(sum);
    }
  }
  return out;
}

/** The inverse of a rigid frame: its rotation transposed, its origin carried back. */
function invert(m: Matrix): Matrix {
  const r = (i: number) => m[i] ?? 0;
  const t = [r(3), r(7), r(11)];
  const rows = [
    [r(0), r(4), r(8)],
    [r(1), r(5), r(9)],
    [r(2), r(6), r(10)],
  ];
  return rows.flatMap((row) => [
    ...row,
    -((row[0] ?? 0) * (t[0] ?? 0) + (row[1] ?? 0) * (t[1] ?? 0) + (row[2] ?? 0) * (t[2] ?? 0)),
  ]);
}

/** Every placement of each representation in the world, through the assembly above it. */
function placementsOf(p: Parsed): Map<number, Matrix[]> {
  // Representations tied without a transformation share one space.
  const root = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (root.has(r) && root.get(r) !== r) r = root.get(r) ?? r;
    root.set(a, r);
    return r;
  };
  for (const [a, b] of p.same) root.set(find(a), find(b));

  const parents = new Map<number, { parent: number; matrix: Matrix }[]>();
  const link = (child: number, parent: number, matrix: Matrix) => {
    const list = parents.get(find(child)) ?? [];
    list.push({ parent: find(parent), matrix });
    parents.set(find(child), list);
  };
  for (const { child, parent, how } of p.moved) {
    const [from = 0, to = 0] = p.transforms.get(how) ?? [];
    link(child, parent, multiply(frame(p, to), invert(frame(p, from))));
  }
  for (const [rep, items] of p.reps) {
    for (const item of items) {
      const [map, target] = p.mapped.get(item) ?? [];
      const [origin, inner] = (map === undefined ? undefined : p.maps.get(map)) ?? [];
      if (target === undefined || origin === undefined || inner === undefined) continue;
      link(inner, rep, multiply(frame(p, target), invert(frame(p, origin))));
    }
  }

  const memo = new Map<number, Matrix[]>();
  const world = (space: number, depth: number): Matrix[] => {
    const known = memo.get(space);
    if (known !== undefined) return known;
    const up = parents.get(space);
    const result =
      up === undefined || depth > 32
        ? [IDENTITY]
        : up.flatMap(({ parent, matrix }) =>
            world(parent, depth + 1).map((above) => multiply(above, matrix)),
          );
    memo.set(space, result);
    return result;
  };
  const out = new Map<number, Matrix[]>();
  for (const rep of p.reps.keys()) out.set(rep, world(find(rep), 0));
  return out;
}

/** One edge as a polyline in its part's own coordinates. */
function trace(
  p: Parsed,
  edge: { from: number; to: number; curve: number; sense: boolean },
): number[] {
  const a = p.xyz.get(p.vertices.get(edge.from) ?? 0);
  const b = p.xyz.get(p.vertices.get(edge.to) ?? 0);
  if (a === undefined || b === undefined) return [];
  let curve = edge.curve;
  for (let i = 0; i < 4 && p.wraps.has(curve); i++) curve = p.wraps.get(curve) ?? curve;
  const circle = p.circles.get(curve);
  if (circle !== undefined && circle.r1 > 0) return arc(p, circle, a, b, edge.sense);
  const controls = p.splines.get(curve);
  if (controls !== undefined && controls.length > 2) {
    const inner = controls.slice(1, -1).flatMap((id) => p.xyz.get(id) ?? []);
    return [...a, ...inner, ...b];
  }
  return [...a, ...b];
}

function arc(
  p: Parsed,
  { at, r1, r2 }: { at: number; r1: number; r2: number },
  a: readonly number[],
  b: readonly number[],
  sense: boolean,
): number[] {
  const m = frame(p, at);
  const angle = (q: readonly number[]) => {
    const d = [(q[0] ?? 0) - (m[3] ?? 0), (q[1] ?? 0) - (m[7] ?? 0), (q[2] ?? 0) - (m[11] ?? 0)];
    const u = (d[0] ?? 0) * (m[0] ?? 0) + (d[1] ?? 0) * (m[4] ?? 0) + (d[2] ?? 0) * (m[8] ?? 0);
    const v = (d[0] ?? 0) * (m[1] ?? 0) + (d[1] ?? 0) * (m[5] ?? 0) + (d[2] ?? 0) * (m[9] ?? 0);
    return Math.atan2(v / r2, u / r1);
  };
  const from = angle(a);
  const full = 2 * Math.PI;
  const closed =
    Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)) <
    1e-9;
  let sweep = closed ? full : (((angle(b) - from) % full) + full) % full;
  if (!closed && !sense) sweep -= full;
  const steps = Math.max(2, Math.ceil((Math.abs(sweep) / full) * CIRCLE_SEGMENTS));
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + (sweep * i) / steps;
    const u = r1 * Math.cos(t);
    const v = r2 * Math.sin(t);
    for (let k = 0; k < 3; k++)
      out.push((m[k * 4 + 3] ?? 0) + u * (m[k * 4] ?? 0) + v * (m[k * 4 + 1] ?? 0));
  }
  return out;
}

/** The edges a brep is bounded by, each once. */
function edgesOf(p: Parsed, brep: number): number[] {
  const seen = new Set<number>();
  const walk = (id: number, depth: number) => {
    if (p.edges.has(id)) {
      seen.add(id);
      return;
    }
    if (depth > 6) return;
    for (const next of p.lists.get(id) ?? []) walk(next, depth + 1);
  };
  walk(brep, 0);
  return [...seen];
}

/** The file's outline and the box it spans, or null when it holds no edges. */
export function parseStepOutline(text: string): { edges: EdgeSet; box: Bounds } | null {
  const p = parse(text);
  const placed = placementsOf(p);
  const positions: number[] = [];
  const starts: number[] = [];
  const drawn = new Set<number>();
  for (const [rep, items] of p.reps) {
    const worlds = placed.get(rep) ?? [IDENTITY];
    for (const brep of items) {
      if (!p.breps.has(brep)) continue;
      drawn.add(brep);
      const lines = edgesOf(p, brep).map((edge) => {
        const found = p.edges.get(edge);
        return found === undefined ? [] : trace(p, found);
      });
      for (const world of worlds) emit(lines, world, p.scale, positions, starts);
    }
  }
  // A brep no representation lists is drawn where it is defined.
  for (const brep of p.breps) {
    if (drawn.has(brep)) continue;
    const lines = edgesOf(p, brep).map((edge) =>
      trace(p, p.edges.get(edge) ?? { from: 0, to: 0, curve: 0, sense: true }),
    );
    emit(lines, IDENTITY, p.scale, positions, starts);
  }
  if (positions.length === 0) return null;
  const edges = {
    positions: Float32Array.from(positions),
    polylineStarts: Uint32Array.from(starts),
  };
  return { edges, box: boxOf(edges.positions) };
}

function emit(
  lines: number[][],
  m: Matrix,
  scale: number,
  positions: number[],
  starts: number[],
): void {
  for (const line of lines) {
    if (line.length < 6) continue;
    starts.push(positions.length);
    for (let i = 0; i + 2 < line.length; i += 3) {
      const x = line[i] ?? 0;
      const y = line[i + 1] ?? 0;
      const z = line[i + 2] ?? 0;
      for (let r = 0; r < 3; r++) {
        const value =
          (m[r * 4] ?? 0) * x +
          (m[r * 4 + 1] ?? 0) * y +
          (m[r * 4 + 2] ?? 0) * z +
          (m[r * 4 + 3] ?? 0);
        positions.push(value * scale);
      }
    }
  }
}

function boxOf(points: Float32Array): Bounds {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i + 2 < points.length; i += 3) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    const z = points[i + 2] ?? 0;
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
  }
  return { min, max };
}
