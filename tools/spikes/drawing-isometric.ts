/**
 * Spike: checks that an isometric projection preserves projected lengths and releases its handles.
 * Run: node --experimental-strip-types tools/spikes/drawing-isometric.ts
 */
import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();
const shape = kernel.makeBox(40, 20, 15);
const before = kernel.shapeCount;
const viewer = { x: 1 / Math.sqrt(3), y: -1 / Math.sqrt(3), z: 1 / Math.sqrt(3) };
const right = { x: 1 / Math.sqrt(2), y: 1 / Math.sqrt(2), z: 0 };
const up = { x: -1 / Math.sqrt(6), y: 1 / Math.sqrt(6), z: 2 / Math.sqrt(6) };
const projection = kernel.projectEdges(shape, { x: 0, y: 0, z: 0 }, viewer, right);
const vertices = kernel.getSubShapes(shape, 'vertex');
const positions = vertices.map((vertex) => kernel.vertexPosition(vertex));
const a = positions.find((p) => Math.hypot(p.x, p.y, p.z) < 1e-6),
  b = positions.find((p) => Math.hypot(p.x - 40, p.y, p.z) < 1e-6);
if (!a || !b) throw new Error('Missing endpoints');
const dot = (p: typeof a, axis: typeof a) => p.x * axis.x + p.y * axis.y + p.z * axis.z;
for (const handle of vertices) kernel.release(handle);
for (const handle of new Set(Object.values(projection)))
  if (Number(handle) !== 0) kernel.release(handle);
console.log(
  JSON.stringify({
    projectedMm: Math.hypot(dot(b, right) - dot(a, right), dot(b, up) - dot(a, up)),
    modelMm: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
    handlesBefore: before,
    handlesAfter: kernel.shapeCount,
  }),
);
kernel.release(shape);
