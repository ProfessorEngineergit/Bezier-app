/** One millimetre-based vector scene shared by the editor, PDF and DXF exporters. */
import type { DrawingProjection } from '@bezier/kernel';
import { settleOverlaps } from './drawing-overlap.js';

export interface SheetOptions {
  title: string;
  author: string;
  number: string;
  revision: string;
  company: string;
  scale: number;
  weight: number;
  hidden: boolean;
  watermark: string;
  watermarkOpacity: number;
  format: 'A4' | 'A3' | 'A2';
  projection: 'third' | 'first';
}
export interface SheetLine {
  points: number[];
  hidden: boolean;
}
export interface SheetView {
  name: string;
  lines: SheetLine[];
  x: number;
  y: number;
  scale: number;
  vertices: { point: [number, number]; world: import('@bezier/kernel').Vec3; depth: number }[];
}
export interface SheetDimension {
  a: [number, number];
  b: [number, number];
  text: string;
  view?: string;
  kind?: 'aligned' | 'horizontal' | 'vertical';
  /** Signed paper-space offset and along-line text position. Omitted in legacy sheets. */
  offset?: number;
  along?: number;
  measured?: number;
}
export interface VectorLogo {
  viewBox: string;
  paths: { d: string; fill: string; transform: string }[];
}
/** ISO 216 landscape, in millimetres. */
export const sheetSize = (format: SheetOptions['format']): [number, number] =>
  format === 'A2' ? [594, 420] : format === 'A3' ? [420, 297] : [297, 210];

/** The geometric characteristics a feature control frame can carry (ISO 1101). */
export type Characteristic =
  | 'position'
  | 'flatness'
  | 'perpendicularity'
  | 'parallelism'
  | 'roundness'
  | 'profile';

export interface ToleranceFrame {
  id: string;
  characteristic: Characteristic;
  /** Tolerance value in millimetres, as typed. */
  tolerance: string;
  /** Datum letters, empty for form tolerances that need none. */
  datum: string;
}

/** A circle as a path, so every exporter that reads paths also gets circles. */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
}

/** GD&T characteristic symbols, drawn in a 5 mm cell centred on (cx, cy). */
export function symbolPath(kind: Characteristic, cx: number, cy: number): string {
  switch (kind) {
    case 'position':
      return `${circlePath(cx, cy, 1.6)}M${cx - 2.2},${cy}h4.4M${cx},${cy - 2.2}v4.4`;
    case 'flatness':
      return `M${cx - 2},${cy + 1}l1,-2h3l-1,2z`;
    case 'perpendicularity':
      return `M${cx - 2},${cy + 1.8}h4M${cx},${cy + 1.8}v-3.8`;
    case 'parallelism':
      return `M${cx - 1.8},${cy + 1.8}l1.6,-3.6M${cx + 0.2},${cy + 1.8}l1.6,-3.6`;
    case 'roundness':
      return circlePath(cx, cy, 1.8);
    case 'profile':
      return `M${cx - 2.2},${cy + 1.2}a2.2,2.2 0 0,1 4.4,0`;
  }
}

/** A scale as drawings print it: 1 : 5, 2 : 1. */
export const scaleLabel = (scale: number) =>
  scale >= 1 ? `${scale} : 1` : `1 : ${Math.round(1 / scale)}`;

/** The standard drawing scales, smallest first (ISO 5455). */
export const SCALES = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10] as const;

/** Detail view B: a circle on the top view, drawn again at twice the scale. */
export interface DetailState {
  on: boolean;
  x: number;
  y: number;
  radius: number;
}

/** A hidden line's dash and gap in paper millimetres, before fitting to the line. */
const DASH = 2.4;
const GAP = 1.2;

/**
 * The dash pattern for one hidden line, stretched so it starts and ends on a dash and has at least
 * one gap (ISO 128-20). A fixed pattern restarts on every polyline, so a hidden edge shorter than
 * one dash would print as a solid stroke and read as a visible edge.
 */
export function hiddenDash(points: readonly number[]): string {
  let length = 0;
  for (let i = 2; i + 1 < points.length; i += 2)
    length += Math.hypot(
      (points[i] ?? 0) - (points[i - 2] ?? 0),
      (points[i + 1] ?? 0) - (points[i - 1] ?? 0),
    );
  if (length <= 0) return `${DASH} ${GAP}`;
  const dashes = Math.max(2, Math.round((length + GAP) / (DASH + GAP)));
  const stretch = length / (dashes * DASH + (dashes - 1) * GAP);
  return `${(DASH * stretch).toFixed(3)} ${(GAP * stretch).toFixed(3)}`;
}

export function layoutViews(projections: DrawingProjection[], options: SheetOptions): SheetView[] {
  const [w, h] = sheetSize(options.format);
  const centers =
    projections.length > 4
      ? [
          [w * 0.2, h * 0.56],
          [w * 0.2, h * 0.24],
          [w * 0.5, h * 0.56],
          [w * 0.5, h * 0.24],
          [w * 0.8, h * 0.56],
          [w * 0.8, h * 0.24],
        ]
      : options.projection === 'third'
        ? [
            [w * 0.3, h * 0.58],
            [w * 0.3, h * 0.24],
            [w * 0.7, h * 0.58],
            [w * 0.7, h * 0.24],
          ]
        : // First angle: the plan goes below the front, the view from the
          // right to its left (ISO 128-30).
          [
            [w * 0.62, h * 0.28],
            [w * 0.62, h * 0.6],
            [w * 0.24, h * 0.28],
            [w * 0.24, h * 0.6],
          ];
  // A curve the projection flattened to a single point would draw nothing and only confuse
  // snapping, so it never reaches the sheet.
  const drawn = (line: number[]) =>
    line.some((value, i) => Math.abs(value - (line[i % 2] ?? 0)) > 1e-9);
  return projections.map((raw, index) => {
    // HLR can report one edge twice (as outline and as sharp edge), and a hidden edge can lie
    // exactly under a visible one. Each is drawn once, so the sheet, its PDF and its DXF carry no
    // doubled or ghost lines.
    const seen = new Set<string>();
    const once = (line: number[]) => {
      const key = line.map((v) => v.toFixed(4)).join(',');
      const back: number[] = [];
      for (let i = line.length - 2; i >= 0; i -= 2) back.push(line[i] ?? 0, line[i + 1] ?? 0);
      const reverse = back.map((v) => v.toFixed(4)).join(',');
      if (seen.has(key) || seen.has(reverse)) return false;
      seen.add(key);
      return true;
    };
    const { visible, hidden } = settleOverlaps(
      raw.visible.filter(drawn).filter(once),
      raw.hidden.filter(drawn).filter(once),
    );
    const view = { ...raw, visible, hidden };
    const all = [...view.visible, ...view.hidden];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const line of all)
      for (let i = 0; i < line.length; i += 2) {
        const x = line[i] ?? 0;
        const y = line[i + 1] ?? 0;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    const center = centers[index] ?? [w / 2, h / 2];
    const x = center[0] ?? 0;
    const y = center[1] ?? 0;
    const transform = (line: number[], hidden: boolean): SheetLine => ({
      hidden,
      points: line.map((value, i) =>
        i % 2 === 0
          ? x + (value - (minX + maxX) / 2) * options.scale
          : y - (value - (minY + maxY) / 2) * options.scale,
      ),
    });
    return {
      name: view.direction,
      x,
      y,
      scale: options.scale * (view.direction === 'detail' ? 2 : 1),
      vertices: (view.vertices ?? []).map((vertex) => ({
        ...vertex,
        point: [
          x + (vertex.point[0] - (minX + maxX) / 2) * options.scale,
          y - (vertex.point[1] - (minY + maxY) / 2) * options.scale,
        ],
      })),
      lines: [
        ...view.visible.map((line) => transform(line, false)),
        ...view.hidden.map((line) => transform(line, true)),
      ],
    };
  });
}

/** Only path geometry is admitted: uploaded SVG cannot execute or load external resources. */
export function readVectorLogo(source: string): VectorLogo {
  if (source.length > 1_000_000) throw new Error('Use an SVG logo smaller than 1 MB.');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.tagName !== 'svg' || doc.querySelector('parsererror'))
    throw new Error('Choose a valid SVG logo.');
  if (doc.querySelector('g[transform], use, text, rect, circle, ellipse, polygon, polyline'))
    throw new Error(
      'Convert logo shapes and text to paths and flatten group transforms before importing.',
    );
  const viewBox = root.getAttribute('viewBox') ?? '';
  if (!/^[-+\d.eE\s,]+$/.test(viewBox) || viewBox.trim().split(/[\s,]+/).length !== 4)
    throw new Error('The SVG needs a valid viewBox.');
  const paths = [...doc.querySelectorAll('path')].map((path) => ({
    d: path.getAttribute('d') ?? '',
    fill: /^#[a-f\d]{3,8}$/i.test(path.getAttribute('fill') ?? '')
      ? (path.getAttribute('fill') ?? '#222')
      : '#222',
    transform: /^[\w\s(),.+-]*$/.test(path.getAttribute('transform') ?? '')
      ? (path.getAttribute('transform') ?? '')
      : '',
  }));
  if (!paths.length) throw new Error('This SVG contains no vector paths.');
  return { viewBox, paths };
}
