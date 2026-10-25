/**
 * Spike: counts HLR edges per class (sharp, outline, smooth; visible or hidden) for a part with a
 * large fillet and writes an SVG (black sharp, blue outline, red smooth) next to the flattened
 * model edges.
 *
 * Result (occt-wasm 5.3.5): HLR classifies correctly. Apparent extra lines from above are seams
 * between B-spline patches. Visual artifacts came from the sheet: hidden edges overlapping visible
 * ones, collinear hidden segments drawn twice, and hidden edges shorter than one dash. Handled in
 * `apps/studio/src/workspaces/drawing-overlap.ts` and `hiddenDash` in `drawing-sheet.ts`.
 *
 *   node tools/spikes/drawing-smooth-edges.ts <part.step> <out.svg> [top|front|right|iso]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { OcctKernel } from '../../node_modules/.pnpm/occt-wasm@5.3.5/node_modules/occt-wasm/dist/index.js';

const [file = '', out = 'drawing-smooth-edges.svg', view = 'top'] = process.argv.slice(2);
const kernel = await OcctKernel.init();
const shape = kernel.importStep(readFileSync(file, 'utf8'));

const lines = (handle: Parameters<typeof kernel.wireframe>[0]): number[][] => {
  if (Number(handle) === 0) return [];
  const { points, edgeGroups } = kernel.wireframe(handle, 0.01);
  const found: number[][] = [];
  for (let g = 0; g < edgeGroups.length; g += 3) {
    const start = edgeGroups[g] ?? 0;
    const count = edgeGroups[g + 1] ?? 0;
    const line: number[] = [];
    for (let i = start; i < start + count; i += 3)
      line.push(points[i] ?? 0, points[i + 1] ?? 0, points[i + 2] ?? 0);
    if (line.length >= 6) found.push(line);
  }
  return found;
};

const faces = kernel.getSubShapes(shape, 'face');
const kinds = new Map<string, number>();
for (const face of faces)
  kinds.set(kernel.surfaceType(face), (kinds.get(kernel.surfaceType(face)) ?? 0) + 1);
console.log('faces', faces.length, Object.fromEntries(kinds));

// Same bases as packages/kernel/src/projection.ts: [towards the viewer, sheet right].
const r3 = Math.sqrt(3);
const r2 = Math.sqrt(2);
const bases: Record<
  string,
  [{ x: number; y: number; z: number }, { x: number; y: number; z: number }]
> = {
  top: [
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 0 },
  ],
  front: [
    { x: 0, y: -1, z: 0 },
    { x: 1, y: 0, z: 0 },
  ],
  right: [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  ],
  iso: [
    { x: 1 / r3, y: -1 / r3, z: 1 / r3 },
    { x: 1 / r2, y: 1 / r2, z: 0 },
  ],
};
const [toViewer, right] = bases[view] ?? bases.top ?? [];
if (!toViewer || !right) throw new Error(`Unknown view ${view}`);
const top = kernel.projectEdges(shape, { x: 0, y: 0, z: 0 }, toViewer, right);
const classes = {
  visibleSharp: lines(top.visibleSharp),
  visibleOutline: lines(top.visibleOutline),
  visibleSmooth: lines(top.visibleSmooth),
  hiddenSharp: lines(top.hiddenSharp),
  hiddenOutline: lines(top.hiddenOutline),
  hiddenSmooth: lines(top.hiddenSmooth),
};
for (const [name, set] of Object.entries(classes)) console.log(name, set.length);

const flat = lines(shape);
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const line of flat)
  for (let i = 0; i < line.length; i += 3) {
    minX = Math.min(minX, line[i] ?? 0);
    maxX = Math.max(maxX, line[i] ?? 0);
    minY = Math.min(minY, line[i + 1] ?? 0);
    maxY = Math.max(maxY, line[i + 1] ?? 0);
  }
const w = maxX - minX;
const h = maxY - minY;
const pad = 10;
const path = (line: number[], dx: number) =>
  `M${Array.from({ length: line.length / 3 }, (_, k) => `${((line[k * 3] ?? 0) - minX + dx).toFixed(2)} ${(maxY - (line[k * 3 + 1] ?? 0)).toFixed(2)}`).join(' L')}`;
const draw = (set: number[][], dx: number, colour: string, extra = '') =>
  set
    .map(
      (line) =>
        `<path d="${path(line, dx)}" fill="none" stroke="${colour}" stroke-width="0.25" ${extra}/>`,
    )
    .join('');
const second = w + pad * 2;
writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w * 2 + pad * 4} ${h + pad * 2}" width="1600">
  <rect x="${-pad}" y="${-pad}" width="100%" height="100%" fill="white"/>
  ${draw(flat, 0, '#222')}
  ${draw(classes.hiddenSmooth, second, '#f0a0a0', 'stroke-dasharray="1 1"')}
  ${draw(classes.hiddenSharp, second, '#999', 'stroke-dasharray="1 1"')}
  ${draw(classes.hiddenOutline, second, '#88a', 'stroke-dasharray="1 1"')}
  ${draw(classes.visibleSmooth, second, '#e02020')}
  ${draw(classes.visibleOutline, second, '#2050e0')}
  ${draw(classes.visibleSharp, second, '#111')}
</svg>`,
);
console.log('size', w.toFixed(2), h.toFixed(2), 'written', out);
kernel.releaseAll();
