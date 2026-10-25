/**
 * Spike: can an import keep a STEP file's colours without changing its geometry?
 *
 * Colours come from the XCAF reader, but imported face names depend on the plain reader's face
 * order (`faceOrder: 'file'`). Compares solids and faces from both readers, times them, and counts
 * where colours are attached.
 *
 * Run: node --import tsx tools/spikes/step-colors.ts /path/to/file.step
 */

import { readFileSync } from 'node:fs';
import { loadOcct } from '../../packages/kernel/src/wasm.ts';

const file = process.argv[2];
if (file === undefined) throw new Error('usage: step-colors <file.step>');
const text = readFileSync(file, 'utf8');
const occt = await loadOcct();

type Handle = ReturnType<typeof occt.makeBox>;

function describe(shape: Handle) {
  const solids = occt.getSubShapes(shape, 'solid');
  const rows = solids.map((solid) => {
    const box = occt.getBoundingBox(solid, { precise: false });
    const faces = occt.subShapeCount(solid, 'face');
    return `${faces}|${[box.xmin, box.ymin, box.zmin, box.xmax, box.ymax, box.zmax].map((v) => v.toFixed(3)).join(',')}`;
  });
  return { solids: solids.length, faces: occt.subShapeCount(shape, 'face'), rows };
}

let started = performance.now();
const plain = occt.importStep(text);
const plainMs = performance.now() - started;
const a = describe(plain);
console.log(`plain reader: ${plainMs.toFixed(0)} ms, ${a.solids} solids, ${a.faces} faces`);

started = performance.now();
const doc = occt.importXCAFFromSTEP(text);
const xcafMs = performance.now() - started;
const roots = doc.getRoots();
console.log(`xcaf reader: ${xcafMs.toFixed(0)} ms, ${roots.length} roots`);

const rootShapes = roots.flatMap((root) => {
  const info = doc.getLabelInfo(root);
  return info.shapeHandle === null ? [] : [info.shapeHandle];
});
const xcafShape = rootShapes.length === 1 ? rootShapes[0] : occt.makeCompound(rootShapes);
if (xcafShape === undefined) throw new Error('no root shape');
const b = describe(xcafShape);
console.log(`xcaf shape: ${b.solids} solids, ${b.faces} faces`);

let same = a.rows.length === b.rows.length;
let firstDiff = -1;
for (let i = 0; i < Math.min(a.rows.length, b.rows.length); i++) {
  if (a.rows[i] !== b.rows[i]) {
    same = false;
    firstDiff = i;
    break;
  }
}
console.log(
  `same solids in the same order with the same faces and boxes: ${same}${firstDiff >= 0 ? ` (first difference at ${firstDiff}: ${a.rows[firstDiff]} vs ${b.rows[firstDiff]})` : ''}`,
);

// Count where colours are attached.
const counts = {
  labels: 0,
  assemblies: 0,
  components: 0,
  parts: 0,
  coloured: { components: 0, parts: 0, subShapes: 0 },
  subShapes: 0,
};
const seen = new Set<number>();
function walk(label: number) {
  counts.labels += 1;
  const info = doc.getLabelInfo(label as never);
  if (info.shapeHandle !== null) occt.release(info.shapeHandle);
  if (info.isComponent) {
    counts.components += 1;
    if (info.hasColor) counts.coloured.components += 1;
    const referred = doc.getReferredLabel(label as never);
    if (referred !== null) walk(referred);
    return;
  }
  if (seen.has(label)) return;
  seen.add(label);
  if (info.isAssembly) {
    counts.assemblies += 1;
    for (const child of doc.getChildren(label as never)) walk(child);
    return;
  }
  counts.parts += 1;
  if (info.hasColor) counts.coloured.parts += 1;
  for (const sub of doc.getSubShapes(label as never)) {
    counts.subShapes += 1;
    const subInfo = doc.getLabelInfo(sub);
    if (subInfo.shapeHandle !== null) occt.release(subInfo.shapeHandle);
    if (subInfo.hasColor) counts.coloured.subShapes += 1;
  }
}
for (const root of roots) walk(root);
console.log('labels:', JSON.stringify(counts));
