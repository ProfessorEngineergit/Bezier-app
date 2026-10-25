/**
 * Sketch import/export as DXF (CAD/CAM) and SVG (laser cutters, illustration).
 * Export: lines, arcs and circles exactly; construction geometry on its own DXF layer, dashed in
 * SVG. Import: DXF lines, arcs, circles and polylines exactly; SVG curves (Bézier, elliptical arcs)
 * are approximated by short lines. Transforms are not applied; such shapes are counted in
 * `skipped`. SVG's y axis points down, so y is flipped both ways.
 */

import { sampleSpline, splinePoles } from '@bezier/core';
import type { Sketch, SketchId, SketchPrimitive } from '@bezier/solver';
import { SketchAdder } from './sketch-builder-points.js';

type P = { x: number; y: number };
type Curve = Exclude<SketchPrimitive, { kind: 'point' }>;

function pointsOf(sketch: Sketch): Map<SketchId, P> {
  const map = new Map<SketchId, P>();
  for (const primitive of sketch.primitives) {
    if (primitive.kind === 'point') map.set(primitive.id, { x: primitive.x, y: primitive.y });
  }
  return map;
}

const curves = (sketch: Sketch) =>
  sketch.primitives.filter((primitive): primitive is Curve => primitive.kind !== 'point');

const n = (value: number) => String(Math.round(value * 1e6) / 1e6);
const degrees = (from: P, to: P) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

// DXF.

export function sketchToDxf(sketch: Sketch): string {
  const at = pointsOf(sketch);
  const out: string[] = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    // Millimetres, so a CAM tool does not guess inches.
    '9',
    '$INSUNITS',
    '70',
    '4',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  for (const curve of curves(sketch)) {
    const layer = curve.construction === true ? 'Construction' : '0';
    if (curve.kind === 'line') {
      const a = at.get(curve.start);
      const b = at.get(curve.end);
      if (a === undefined || b === undefined) continue;
      out.push(
        '0',
        'LINE',
        '8',
        layer,
        '10',
        n(a.x),
        '20',
        n(a.y),
        '30',
        '0',
        '11',
        n(b.x),
        '21',
        n(b.y),
        '31',
        '0',
      );
    } else if (curve.kind === 'circle') {
      const c = at.get(curve.center);
      if (c === undefined) continue;
      out.push(
        '0',
        'CIRCLE',
        '8',
        layer,
        '10',
        n(c.x),
        '20',
        n(c.y),
        '30',
        '0',
        '40',
        n(curve.radius),
      );
    } else if (curve.kind === 'ellipse') {
      const c = at.get(curve.center);
      const v = at.get(curve.vertex);
      if (c === undefined || v === undefined) continue;
      const a = Math.hypot(v.x - c.x, v.y - c.y);
      // DXF's ellipse: the long axis as a vector from the centre, and the short one as a ratio.
      out.push(
        '0',
        'ELLIPSE',
        '8',
        layer,
        '10',
        n(c.x),
        '20',
        n(c.y),
        '30',
        '0',
        '11',
        n(v.x - c.x),
        '21',
        n(v.y - c.y),
        '31',
        '0',
        '40',
        n(a > 0 ? curve.minor / a : 1),
        '41',
        '0',
        '42',
        n(2 * Math.PI),
      );
    } else if (curve.kind === 'spline') {
      // Written as its polyline approximation, since every reader supports LINE.
      const through = curve.points.map((id) => at.get(id));
      if (through.some((point) => point === undefined)) continue;
      const path = sampleSpline(through as P[], curve.closed === true);
      for (let k = 0; k + 1 < path.length; k += 1) {
        const a = path[k] as P;
        const b = path[k + 1] as P;
        out.push(
          '0',
          'LINE',
          '8',
          layer,
          '10',
          n(a.x),
          '20',
          n(a.y),
          '30',
          '0',
          '11',
          n(b.x),
          '21',
          n(b.y),
          '31',
          '0',
        );
      }
    } else {
      const c = at.get(curve.center);
      const s = at.get(curve.start);
      const e = at.get(curve.end);
      if (c === undefined || s === undefined || e === undefined) continue;
      // DXF arcs run counter-clockwise from start angle to end angle, as ours do.
      const radius = Math.hypot(s.x - c.x, s.y - c.y);
      out.push(
        '0',
        'ARC',
        '8',
        layer,
        '10',
        n(c.x),
        '20',
        n(c.y),
        '30',
        '0',
        '40',
        n(radius),
        '50',
        n(degrees(c, s)),
        '51',
        n(degrees(c, e)),
      );
    }
  }
  out.push('0', 'ENDSEC', '0', 'EOF', '');
  return out.join('\n');
}

export type SketchRead =
  | { ok: true; sketch: Sketch; skipped: number }
  | { ok: false; message: string };

/** DXF entities into `into`. Units are taken as millimetres. */
export function dxfToSketch(text: string, into: Sketch): SketchRead {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push([Number.parseInt(lines[i]?.trim() ?? '', 10), (lines[i + 1] ?? '').trim()]);
  }
  const adder = new SketchAdder(into);
  let skipped = 0;
  let inEntities = false;
  let i = 0;
  const readEntity = () => {
    const codes = new Map<number, string[]>();
    i += 1;
    while (i < pairs.length && pairs[i]?.[0] !== 0) {
      const [code, value] = pairs[i] as [number, string];
      codes.set(code, [...(codes.get(code) ?? []), value]);
      i += 1;
    }
    return codes;
  };
  const num = (codes: Map<number, string[]>, code: number, index = 0) =>
    Number(codes.get(code)?.[index] ?? 0);
  while (i < pairs.length) {
    const [code, value] = pairs[i] as [number, string];
    if (code === 0 && value === 'SECTION') {
      inEntities = pairs[i + 1]?.[1] === 'ENTITIES';
      i += 2;
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      inEntities = false;
      i += 1;
      continue;
    }
    if (!inEntities || code !== 0) {
      i += 1;
      continue;
    }
    const type = value;
    const codes = readEntity();
    const construction = (codes.get(8)?.[0] ?? '').toLowerCase() === 'construction';
    if (type === 'LINE') {
      adder.line(
        { x: num(codes, 10), y: num(codes, 20) },
        { x: num(codes, 11), y: num(codes, 21) },
        construction,
      );
    } else if (type === 'CIRCLE') {
      adder.circle({ x: num(codes, 10), y: num(codes, 20) }, num(codes, 40), construction);
    } else if (type === 'ARC') {
      const c = { x: num(codes, 10), y: num(codes, 20) };
      const r = num(codes, 40);
      const at = (deg: number) => ({
        x: c.x + r * Math.cos((deg * Math.PI) / 180),
        y: c.y + r * Math.sin((deg * Math.PI) / 180),
      });
      adder.arc(c, at(num(codes, 50)), at(num(codes, 51)), construction);
    } else if (type === 'LWPOLYLINE') {
      const xs = codes.get(10) ?? [];
      const ys = codes.get(20) ?? [];
      const corners = xs.map((x, k) => ({ x: Number(x), y: Number(ys[k] ?? 0) }));
      const closed = (num(codes, 70) & 1) === 1;
      // Bulged segments (arcs) are imported straight: rare in sketches, and counted as simplified.
      if ((codes.get(42) ?? []).some((bulge) => Number(bulge) !== 0)) skipped += 1;
      for (let k = 0; k + 1 < corners.length; k += 1) {
        adder.line(corners[k] as P, corners[k + 1] as P, construction);
      }
      if (closed && corners.length > 2)
        adder.line(corners[corners.length - 1] as P, corners[0] as P, construction);
    } else {
      skipped += 1;
    }
  }
  if (adder.added.length === 0) {
    return { ok: false, message: 'This DXF file holds no lines, arcs or circles.' };
  }
  return { ok: true, sketch: adder.into(into), skipped };
}

// SVG.

export function sketchToSvg(sketch: Sketch): string {
  const at = pointsOf(sketch);
  const shapes: string[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  // Fit the page to the curves, not their full circles (audit F-008).
  const grow = (p: P, rx = 0, ry = rx) => {
    minX = Math.min(minX, p.x - rx);
    minY = Math.min(minY, p.y - ry);
    maxX = Math.max(maxX, p.x + rx);
    maxY = Math.max(maxY, p.y + ry);
  };
  for (const curve of curves(sketch)) {
    const style = curve.construction === true ? ' stroke-dasharray="2 1.5" stroke="#8a93a6"' : '';
    if (curve.kind === 'line') {
      const a = at.get(curve.start);
      const b = at.get(curve.end);
      if (a === undefined || b === undefined) continue;
      grow(a);
      grow(b);
      shapes.push(`<line x1="${n(a.x)}" y1="${n(-a.y)}" x2="${n(b.x)}" y2="${n(-b.y)}"${style}/>`);
    } else if (curve.kind === 'circle') {
      const c = at.get(curve.center);
      if (c === undefined) continue;
      grow(c, curve.radius);
      shapes.push(`<circle cx="${n(c.x)}" cy="${n(-c.y)}" r="${n(curve.radius)}"${style}/>`);
    } else if (curve.kind === 'ellipse') {
      const c = at.get(curve.center);
      const v = at.get(curve.vertex);
      if (c === undefined || v === undefined) continue;
      const a = Math.hypot(v.x - c.x, v.y - c.y);
      const [cos, sin] = [(v.x - c.x) / (a || 1), (v.y - c.y) / (a || 1)];
      const b = curve.minor;
      grow(c, Math.hypot(a * cos, b * sin), Math.hypot(a * sin, b * cos));
      // y is flipped in SVG, so the rotation direction is reversed.
      const turn = -Math.atan2(v.y - c.y, v.x - c.x) * (180 / Math.PI);
      shapes.push(
        `<ellipse cx="${n(c.x)}" cy="${n(-c.y)}" rx="${n(a)}" ry="${n(curve.minor)}" transform="rotate(${n(turn)} ${n(c.x)} ${n(-c.y)})"${style}/>`,
      );
    } else if (curve.kind === 'spline') {
      // Exported as its exact cubic Bézier segments.
      const through = curve.points.map((id) => at.get(id));
      if (through.some((point) => point === undefined)) continue;
      const poles = splinePoles(through as P[], curve.closed === true && through.length >= 3);
      if (poles.length < 4) continue;
      for (const pole of poles) grow(pole);
      const [first, ...rest] = poles as [P, ...P[]];
      const pieces: string[] = [];
      for (let k = 0; k + 2 < rest.length; k += 3) {
        const [p1, p2, p3] = [rest[k], rest[k + 1], rest[k + 2]] as [P, P, P];
        pieces.push(`C ${n(p1.x)} ${n(-p1.y)} ${n(p2.x)} ${n(-p2.y)} ${n(p3.x)} ${n(-p3.y)}`);
      }
      shapes.push(`<path d="M ${n(first.x)} ${n(-first.y)} ${pieces.join(' ')}"${style}/>`);
    } else {
      const c = at.get(curve.center);
      const s = at.get(curve.start);
      const e = at.get(curve.end);
      if (c === undefined || s === undefined || e === undefined) continue;
      const r = Math.hypot(s.x - c.x, s.y - c.y);
      let sweep = (((degrees(c, e) - degrees(c, s)) % 360) + 360) % 360;
      if (sweep === 0) sweep = 360;
      grow(s);
      grow(e);
      // An arc reaches its circle's extent only at the quadrant points it passes.
      for (const quarter of [0, 90, 180, 270]) {
        if ((((quarter - degrees(c, s)) % 360) + 360) % 360 > sweep) continue;
        const turn = (quarter * Math.PI) / 180;
        grow({ x: c.x + r * Math.cos(turn), y: c.y + r * Math.sin(turn) });
      }
      // Counter-clockwise in the sketch is clockwise once y is flipped: sweep flag 0.
      shapes.push(
        `<path d="M ${n(s.x)} ${n(-s.y)} A ${n(r)} ${n(r)} 0 ${sweep > 180 ? 1 : 0} 0 ${n(e.x)} ${n(-e.y)}"${style}/>`,
      );
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  const pad = 1;
  const width = maxX - minX + 2 * pad;
  const height = maxY - minY + 2 * pad;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}mm" height="${n(height)}mm" viewBox="${n(minX - pad)} ${n(-maxY - pad)} ${n(width)} ${n(height)}">`,
    '<g fill="none" stroke="#000" stroke-width="0.25">',
    ...shapes,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

function attributes(tag: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g)) {
    map.set((match[1] ?? match[3] ?? '').toLowerCase(), match[2] ?? match[4] ?? '');
  }
  return map;
}

/** SVG shapes and paths into `into`, y flipped, one user unit taken as a millimetre. */
export function svgToSketch(text: string, into: Sketch): SketchRead {
  const adder = new SketchAdder(into);
  let skipped = 0;
  const f = (value: string | undefined) => Number.parseFloat(value ?? '0') || 0;
  const flip = (p: P): P => ({ x: p.x, y: -p.y });
  const chain = (points: P[], closed: boolean) => {
    for (let k = 0; k + 1 < points.length; k += 1)
      adder.line(flip(points[k] as P), flip(points[k + 1] as P));
    if (closed && points.length > 2)
      adder.line(flip(points[points.length - 1] as P), flip(points[0] as P));
  };
  for (const match of text.matchAll(
    /<(line|rect|circle|ellipse|polyline|polygon|path)\b([^>]*)>/gi,
  )) {
    const kind = (match[1] ?? '').toLowerCase();
    const a = attributes(match[2] ?? '');
    if (a.has('transform')) skipped += 1;
    if (kind === 'line') {
      chain(
        [
          { x: f(a.get('x1')), y: f(a.get('y1')) },
          { x: f(a.get('x2')), y: f(a.get('y2')) },
        ],
        false,
      );
    } else if (kind === 'rect') {
      const x = f(a.get('x'));
      const y = f(a.get('y'));
      const w = f(a.get('width'));
      const h = f(a.get('height'));
      chain(
        [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        true,
      );
    } else if (kind === 'circle') {
      adder.circle(flip({ x: f(a.get('cx')), y: f(a.get('cy')) }), f(a.get('r')));
    } else if (kind === 'ellipse') {
      const rx = f(a.get('rx'));
      const ry = f(a.get('ry'));
      const cx = f(a.get('cx'));
      const cy = f(a.get('cy'));
      if (Math.abs(rx - ry) < 1e-9) adder.circle(flip({ x: cx, y: cy }), rx);
      else
        chain(
          Array.from({ length: 48 }, (_, k) => ({
            x: cx + rx * Math.cos((k / 48) * 2 * Math.PI),
            y: cy + ry * Math.sin((k / 48) * 2 * Math.PI),
          })),
          true,
        );
    } else if (kind === 'polyline' || kind === 'polygon') {
      const numbers = (a.get('points') ?? '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      const points: P[] = [];
      for (let k = 0; k + 1 < numbers.length; k += 2)
        points.push({ x: numbers[k] ?? 0, y: numbers[k + 1] ?? 0 });
      chain(points, kind === 'polygon');
    } else {
      for (const run of pathRuns(a.get('d') ?? '')) chain(run.points, run.closed);
    }
  }
  if (adder.added.length === 0)
    return { ok: false, message: 'This SVG file holds no shapes to draw.' };
  return { ok: true, sketch: adder.into(into), skipped };
}

/**
 * A path's subpaths as point runs. Straight commands are exact; curves are sampled into short lines
 * (12 per curve).
 */
function pathRuns(d: string): { points: P[]; closed: boolean }[] {
  const tokens = [...d.matchAll(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g)].map((m) => m[0]);
  const runs: { points: P[]; closed: boolean }[] = [];
  let run: P[] = [];
  let at: P = { x: 0, y: 0 };
  let start: P = at;
  let command = '';
  let i = 0;
  const next = () => Number(tokens[i++] ?? 0);
  const finish = (closed: boolean) => {
    if (run.length > 1) runs.push({ points: run, closed });
    run = [];
  };
  const to = (p: P) => {
    at = p;
    run.push(p);
  };
  const SAMPLES = 12;
  while (i < tokens.length) {
    const token = tokens[i] ?? '';
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      i += 1;
    }
    const rel = command === command.toLowerCase();
    const off = (x: number, y: number): P => (rel ? { x: at.x + x, y: at.y + y } : { x, y });
    switch (command.toUpperCase()) {
      case 'M': {
        finish(false);
        const p = off(next(), next());
        start = p;
        to(p);
        // Further pairs after a move are lines.
        command = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        to(off(next(), next()));
        break;
      case 'H':
        to({ x: rel ? at.x + next() : next(), y: at.y });
        break;
      case 'V':
        to({ x: at.x, y: rel ? at.y + next() : next() });
        break;
      case 'C': {
        const p0 = at;
        const p1 = off(next(), next());
        const p2 = off(next(), next());
        const p3 = off(next(), next());
        for (let k = 1; k <= SAMPLES; k += 1) {
          const t = k / SAMPLES;
          const u = 1 - t;
          to({
            x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
            y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
          });
        }
        break;
      }
      case 'Q': {
        const p0 = at;
        const p1 = off(next(), next());
        const p2 = off(next(), next());
        for (let k = 1; k <= SAMPLES; k += 1) {
          const t = k / SAMPLES;
          const u = 1 - t;
          to({
            x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
            y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
          });
        }
        break;
      }
      case 'A': {
        const rx = Math.abs(next());
        const ry = Math.abs(next());
        const phi = (next() * Math.PI) / 180;
        const large = next() !== 0;
        const sweep = next() !== 0;
        const end = off(next(), next());
        for (const p of arcSamples(at, end, rx, ry, phi, large, sweep, SAMPLES)) to(p);
        break;
      }
      case 'Z':
        if (run.length > 0 && Math.hypot(at.x - start.x, at.y - start.y) < 1e-9) run.pop();
        finish(true);
        at = start;
        break;
      default:
        i += 1;
    }
  }
  finish(false);
  return runs;
}

/**
 * Points along an SVG elliptical arc, after the start: the endpoint form turned into centre form as
 * the SVG specification (appendix F.6.5) does it.
 */
function arcSamples(
  from: P,
  to: P,
  rxIn: number,
  ryIn: number,
  phi: number,
  large: boolean,
  sweep: boolean,
  samples: number,
): P[] {
  if (rxIn === 0 || ryIn === 0) return [to];
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let rx = rxIn;
  let ry = ryIn;
  // Radii too small for the endpoints are scaled up until they just fit.
  const fit = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (fit > 1) {
    rx *= Math.sqrt(fit);
    ry *= Math.sqrt(fit);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const out: P[] = [];
  for (let s = 1; s <= samples; s += 1) {
    const t = start + (delta * s) / samples;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  // The last sample is the endpoint itself, exactly, so the next segment joins.
  out[out.length - 1] = to;
  return out;
}
