/**
 * Spline and ellipse geometry, shared by drawing, region finding and the kernel so all agree. A
 * spline is the cubic Bézier chain from `splinePoles`, passed to the kernel as those poles.
 */

export interface P2 {
  x: number;
  y: number;
}

/**
 * Bézier poles (3n + 1 for n pieces) of a smooth curve through `points`. Tangents average the
 * neighbour directions and handles are a third of the piece length, avoiding overshoot. Closed
 * curves have no corner at the start; open ends head straight to their neighbour.
 */
export function splinePoles(points: readonly P2[], closed: boolean): P2[] {
  const through = closed ? [...points, points[0] as P2] : [...points];
  const count = through.length;
  if (count < 2) return [];
  const unit = (a: P2, b: P2) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  };
  const at = (i: number) => through[i] as P2;
  const tangent = (i: number): P2 => {
    const last = count - 1;
    const previous = i > 0 ? at(i - 1) : closed ? at(last - 1) : null;
    const next = i < last ? at(i + 1) : closed ? at(1) : null;
    if (previous === null) return unit(at(i), next ?? at(i));
    if (next === null) return unit(previous, at(i));
    const a = unit(previous, at(i));
    const b = unit(at(i), next);
    const sum = { x: a.x + b.x, y: a.y + b.y };
    const length = Math.hypot(sum.x, sum.y);
    return length < 1e-12 ? b : { x: sum.x / length, y: sum.y / length };
  };
  const poles: P2[] = [at(0)];
  for (let i = 0; i + 1 < count; i += 1) {
    const a = at(i);
    const b = at(i + 1);
    const third = Math.hypot(b.x - a.x, b.y - a.y) / 3;
    const ta = tangent(i);
    const tb = tangent(i + 1);
    poles.push(
      { x: a.x + ta.x * third, y: a.y + ta.y * third },
      { x: b.x - tb.x * third, y: b.y - tb.y * third },
      b,
    );
  }
  return poles;
}

/** A point on a Bézier chain, `t` from 0 to 1 over the whole chain. */
export function bezierChainAt(poles: readonly P2[], t: number): P2 {
  const pieces = (poles.length - 1) / 3;
  const scaled = Math.min(Math.max(t, 0), 1) * pieces;
  const piece = Math.min(Math.floor(scaled), pieces - 1);
  const s = scaled - piece;
  const [p0, p1, p2, p3] = [0, 1, 2, 3].map((k) => poles[piece * 3 + k] as P2) as [P2, P2, P2, P2];
  const m = 1 - s;
  const a = m * m * m;
  const b = 3 * m * m * s;
  const c = 3 * m * s * s;
  const d = s * s * s;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** The sub-chain between two parameters. */
export function bezierChainBetween(poles: readonly P2[], t0: number, t1: number): P2[] {
  const pieces = (poles.length - 1) / 3;
  const out: P2[] = [];
  const first = Math.min(Math.floor(t0 * pieces), pieces - 1);
  const last = Math.min(Math.ceil(t1 * pieces) - 1, pieces - 1);
  for (let piece = first; piece <= last; piece += 1) {
    const local0 = Math.max(0, t0 * pieces - piece);
    const local1 = Math.min(1, t1 * pieces - piece);
    if (local1 - local0 < 1e-12) continue;
    const quad = [0, 1, 2, 3].map((k) => poles[piece * 3 + k] as P2) as [P2, P2, P2, P2];
    const part = subBezier(quad, local0, local1);
    if (out.length === 0) out.push(part[0]);
    out.push(part[1], part[2], part[3]);
  }
  return out;
}

/** A cubic Bézier segment between two parameters, by de Casteljau twice. */
function subBezier(q: [P2, P2, P2, P2], s0: number, s1: number): [P2, P2, P2, P2] {
  const tail = split(q, s0)[1];
  const span = s0 >= 1 ? 0 : (s1 - s0) / (1 - s0);
  return split(tail, span)[0];
}

function split(q: [P2, P2, P2, P2], s: number): [[P2, P2, P2, P2], [P2, P2, P2, P2]] {
  const lerp = (a: P2, b: P2) => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
  const a = lerp(q[0], q[1]);
  const b = lerp(q[1], q[2]);
  const c = lerp(q[2], q[3]);
  const d = lerp(a, b);
  const e = lerp(b, c);
  const f = lerp(d, e);
  return [
    [q[0], a, d, f],
    [f, e, c, q[3]],
  ];
}

/** A point on an ellipse at an angle from its major axis. */
export function ellipseAt(center: P2, major: P2, minor: number, angle: number): P2 {
  const a = Math.hypot(major.x, major.y) || 1;
  const u = { x: major.x / a, y: major.y / a };
  const cos = Math.cos(angle) * a;
  const sin = Math.sin(angle) * minor;
  return { x: center.x + u.x * cos - u.y * sin, y: center.y + u.y * cos + u.x * sin };
}

/** Sampled points of a spline through `through`, for drawing and picking. */
export function sampleSpline(through: readonly P2[], closed: boolean, perPiece = 24): P2[] {
  const poles = splinePoles(through, closed && through.length >= 3);
  if (poles.length < 4) return [...through];
  const count = ((poles.length - 1) / 3) * perPiece;
  return Array.from({ length: count + 1 }, (_, k) => bezierChainAt(poles, k / count));
}

/** Sampled points of an ellipse given its centre and major-axis endpoint. */
export function sampleEllipse(center: P2, vertex: P2, minor: number, count = 128): P2[] {
  const major = { x: vertex.x - center.x, y: vertex.y - center.y };
  return Array.from({ length: count + 1 }, (_, k) =>
    ellipseAt(center, major, minor, (2 * Math.PI * k) / count),
  );
}
