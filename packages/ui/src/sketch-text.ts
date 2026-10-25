/**
 * Sketch text: lays out letters from a TrueType font and converts them to sketch geometry (lines
 * for straight edges, splines for curves, corners preserved), so text behaves like any other
 * geometry. The font tables needed (`cmap`, `glyf`, `loca`, `hmtx`) are parsed here directly to
 * avoid a large font library dependency.
 */

import type { Sketch, SketchId, SketchPrimitive } from '@bezier/solver';
import { nextSketchId } from './sketch-id.js';
import type { Point2D } from './sketch-tools.js';

interface Q {
  x: number;
  y: number;
}

/** A glyph's outline: closed contours of line and quadratic pieces, in font units. */
type Segment = { kind: 'line'; to: Q } | { kind: 'quad'; control: Q; to: Q };
interface Contour {
  start: Q;
  segments: Segment[];
}

export interface Font {
  unitsPerEm: number;
  glyphFor(code: number): number;
  advance(glyph: number): number;
  outline(glyph: number): Contour[];
}

/** Parses a TrueType font. Throws a readable error for unsupported fonts. */
export function parseFont(buffer: ArrayBuffer): Font {
  const view = new DataView(buffer);
  const tables = new Map<string, number>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(...[0, 1, 2, 3].map((k) => view.getUint8(at + k)));
    tables.set(tag, view.getUint32(at + 8));
  }
  const table = (tag: string) => {
    const at = tables.get(tag);
    if (at === undefined)
      throw new Error(`This font has no ${tag} table, so its letters cannot be read.`);
    return at;
  };
  const head = table('head');
  const unitsPerEm = view.getUint16(head + 18);
  const longLoca = view.getInt16(head + 50) === 1;
  const glyphCount = view.getUint16(table('maxp') + 4);
  const metrics = view.getUint16(table('hhea') + 34);
  const hmtx = table('hmtx');
  const loca = table('loca');
  const glyf = table('glyf');

  const glyphStart = (glyph: number) =>
    longLoca ? view.getUint32(loca + glyph * 4) : view.getUint16(loca + glyph * 2) * 2;

  const unicode = cmapFormat4(view, table('cmap'));

  const outline = (glyph: number, depth = 0): Contour[] => {
    if (glyph < 0 || glyph >= glyphCount || depth > 4) return [];
    const at = glyf + glyphStart(glyph);
    if (glyphStart(glyph + 1) === glyphStart(glyph)) return [];
    const contours = view.getInt16(at);
    return contours >= 0
      ? simpleGlyph(view, at, contours)
      : compositeGlyph(view, at, outline, depth);
  };

  return {
    unitsPerEm,
    glyphFor: (code) => unicode(code),
    advance: (glyph) => view.getUint16(hmtx + Math.min(glyph, metrics - 1) * 4),
    outline: (glyph) => outline(glyph),
  };
}

/** Glyph index for a character, from the Windows Unicode cmap (format 4, present in every font). */
function cmapFormat4(view: DataView, cmap: number): (code: number) => number {
  const subtables = view.getUint16(cmap + 2);
  let at = -1;
  for (let i = 0; i < subtables; i += 1) {
    const platform = view.getUint16(cmap + 4 + i * 8);
    const encoding = view.getUint16(cmap + 6 + i * 8);
    const offset = view.getUint32(cmap + 8 + i * 8);
    if (view.getUint16(cmap + offset) !== 4) continue;
    if ((platform === 3 && encoding === 1) || platform === 0) at = cmap + offset;
  }
  if (at < 0) throw new Error('This font has no Unicode letter map this can read.');
  const segments = view.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  return (code) => {
    for (let i = 0; i < segments; i += 1) {
      if (view.getUint16(ends + i * 2) < code) continue;
      const start = view.getUint16(starts + i * 2);
      if (start > code) return 0;
      const delta = view.getInt16(deltas + i * 2);
      const range = view.getUint16(ranges + i * 2);
      if (range === 0) return (code + delta) & 0xffff;
      const glyph = view.getUint16(ranges + i * 2 + range + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function simpleGlyph(view: DataView, at: number, contourCount: number): Contour[] {
  const ends: number[] = [];
  for (let i = 0; i < contourCount; i += 1) ends.push(view.getUint16(at + 10 + i * 2));
  const total = (ends[ends.length - 1] ?? -1) + 1;
  let p = at + 10 + contourCount * 2;
  p += 2 + view.getUint16(p);
  const flags: number[] = [];
  while (flags.length < total) {
    const flag = view.getUint8(p++);
    flags.push(flag);
    if (flag & 8) {
      const repeat = view.getUint8(p++);
      for (let r = 0; r < repeat; r += 1) flags.push(flag);
    }
  }
  const read = (short: number, same: number) => {
    const values: number[] = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & short) {
        const step = view.getUint8(p++);
        value += flag & same ? step : -step;
      } else if (!(flag & same)) {
        value += view.getInt16(p);
        p += 2;
      }
      values.push(value);
    }
    return values;
  };
  const xs = read(2, 16);
  const ys = read(4, 32);
  const contours: Contour[] = [];
  let first = 0;
  for (const end of ends) {
    const points = [];
    for (let k = first; k <= end; k += 1)
      points.push({ x: xs[k] ?? 0, y: ys[k] ?? 0, on: ((flags[k] ?? 0) & 1) === 1 });
    first = end + 1;
    const contour = toContour(points);
    if (contour !== null) contours.push(contour);
  }
  return contours;
}

/**
 * Converts on/off-curve points into pieces; two consecutive off points imply an on point between.
 */
function toContour(points: { x: number; y: number; on: boolean }[]): Contour | null {
  if (points.length < 2) return null;
  const startIndex = points.findIndex((point) => point.on);
  const mid = (a: Q, b: Q) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const ordered =
    startIndex >= 0
      ? [...points.slice(startIndex), ...points.slice(0, startIndex)]
      : // A contour of off points only: start between its first two.
        [
          { ...mid(points[0] as Q, points[1] as Q), on: true },
          ...points.slice(1),
          points[0] as Q & { on: boolean },
        ];
  const start = ordered[0] as Q;
  const segments: Segment[] = [];
  let control: Q | null = null;
  for (const point of [...ordered.slice(1), start as Q & { on: boolean }]) {
    const on = 'on' in point ? point.on : true;
    if (on) {
      segments.push(
        control === null ? { kind: 'line', to: point } : { kind: 'quad', control, to: point },
      );
      control = null;
    } else if (control === null) {
      control = point;
    } else {
      const implied = mid(control, point);
      segments.push({ kind: 'quad', control, to: implied });
      control = point;
    }
  }
  if (control !== null) segments.push({ kind: 'quad', control, to: start });
  return { start, segments };
}

function compositeGlyph(
  view: DataView,
  at: number,
  outline: (glyph: number, depth: number) => Contour[],
  depth: number,
): Contour[] {
  const contours: Contour[] = [];
  let p = at + 10;
  for (;;) {
    const flags = view.getUint16(p);
    const glyph = view.getUint16(p + 2);
    p += 4;
    const words = (flags & 1) !== 0;
    const dx = words ? view.getInt16(p) : view.getInt8(p);
    const dy = words ? view.getInt16(p + 2) : view.getInt8(p + 1);
    p += words ? 4 : 2;
    let a = 1;
    let d = 1;
    let b = 0;
    let c = 0;
    const f2 = (at2: number) => view.getInt16(at2) / 16384;
    if (flags & 8) {
      a = d = f2(p);
      p += 2;
    } else if (flags & 0x40) {
      a = f2(p);
      d = f2(p + 2);
      p += 4;
    } else if (flags & 0x80) {
      a = f2(p);
      b = f2(p + 2);
      c = f2(p + 4);
      d = f2(p + 6);
      p += 8;
    }
    const place = (q: Q) => ({ x: q.x * a + q.y * c + dx, y: q.x * b + q.y * d + dy });
    for (const contour of outline(glyph, depth + 1))
      contours.push({
        start: place(contour.start),
        segments: contour.segments.map((s) =>
          s.kind === 'line'
            ? { kind: 'line', to: place(s.to) }
            : { kind: 'quad', control: place(s.control), to: place(s.to) },
        ),
      });
    if (!(flags & 0x20)) break;
  }
  return contours;
}

/**
 * Lays out `text` starting at `at` (baseline start), `height` mm from baseline to cap height, and
 * adds it to the sketch: one line per straight edge, one spline per curved run. Curved runs break
 * at sharp turns so letter corners stay corners. Lines of `text` stack downwards. Characters
 * missing from `font` (e.g. Ω in Archivo) come from `fallback` (audit F-007).
 */
export function textToSketch(
  sketch: Sketch,
  font: Font,
  text: string,
  at: Point2D,
  height: number,
  fallback?: Font,
): Sketch {
  const scaleOf = (face: Font) => height / (face.unitsPerEm * 0.7);
  const primitives: SketchPrimitive[] = [...sketch.primitives];
  let draft: Sketch = { ...sketch, primitives };
  const pointId = new Map<string, SketchId>();
  const point = (q: Q): SketchId => {
    const key = `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
    const known = pointId.get(key);
    if (known !== undefined) return known;
    const id = nextSketchId(draft, 'p');
    primitives.push({ kind: 'point', id, x: q.x, y: q.y });
    draft = { ...draft, primitives };
    pointId.set(key, id);
    return id;
  };
  const add = (primitive: SketchPrimitive) => {
    primitives.push(primitive);
    draft = { ...draft, primitives };
  };
  // One shared id for all pieces of this text, to group them.
  const group = nextSketchId(draft, 'text');
  // In millimetres, so letters from both fonts line up.
  let pen = 0;
  let baseline = at.v;
  for (const character of text) {
    if (character === '\n') {
      pen = 0;
      baseline -= height * 1.4;
      continue;
    }
    const code = character.codePointAt(0) ?? 32;
    let face = font;
    let glyph = font.glyphFor(code);
    if (glyph === 0 && fallback !== undefined && fallback.glyphFor(code) !== 0) {
      face = fallback;
      glyph = fallback.glyphFor(code);
    }
    const scale = scaleOf(face);
    const left = at.u + pen;
    const place = (q: Q): Q => ({ x: left + q.x * scale, y: baseline + q.y * scale });
    for (const contour of face.outline(glyph)) {
      pointId.clear();
      for (const run of runsOf(contour)) {
        if (run.kind === 'line') {
          const a = point(place(run.from));
          const b = point(place(run.to));
          if (a !== b) add({ kind: 'line', id: nextSketchId(draft, 'l'), start: a, end: b, group });
        } else {
          const through = run.through.map((q) => point(place(q)));
          const distinct = through.filter((id, k) => k === 0 || id !== through[k - 1]);
          if (distinct.length >= 2)
            add({ kind: 'spline', id: nextSketchId(draft, 's'), points: distinct, group });
        }
      }
    }
    pen += face.advance(glyph) * scale;
  }
  return draft;
}

type Run = { kind: 'line'; from: Q; to: Q } | { kind: 'curve'; through: Q[] };

/**
 * Splits a contour into runs: each straight piece alone, consecutive curved pieces between corners
 * as one run. A closed curve without corners (an O) is split in two, since a run has two ends.
 */
function runsOf(contour: Contour): Run[] {
  const runs: Run[] = [];
  let from = contour.start;
  let current: Q[] | null = null;
  let lastDirection: Q | null = null;
  const direction = (a: Q, b: Q) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  };
  const smooth = (a: Q | null, b: Q) =>
    a !== null && a.x * b.x + a.y * b.y > Math.cos((12 * Math.PI) / 180);
  for (const segment of contour.segments) {
    if (segment.kind === 'line') {
      if (current !== null) runs.push({ kind: 'curve', through: current });
      current = null;
      runs.push({ kind: 'line', from, to: segment.to });
      lastDirection = direction(from, segment.to);
    } else {
      const quadAt = (t: number) => ({
        x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * segment.control.x + t * t * segment.to.x,
        y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * segment.control.y + t * t * segment.to.y,
      });
      const leaving = direction(from, segment.control);
      if (current === null || !smooth(lastDirection, leaving)) {
        if (current !== null) runs.push({ kind: 'curve', through: current });
        current = [from];
      }
      current.push(quadAt(0.5), segment.to);
      lastDirection = direction(segment.control, segment.to);
    }
    from = segment.to;
  }
  if (current !== null) runs.push({ kind: 'curve', through: current });
  // A single closed curve: two halves.
  if (runs.length === 1 && runs[0]?.kind === 'curve') {
    const through = runs[0].through;
    const half = Math.floor(through.length / 2);
    return [
      { kind: 'curve', through: through.slice(0, half + 1) },
      { kind: 'curve', through: through.slice(half) },
    ];
  }
  return runs;
}
