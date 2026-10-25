/** Check whether HLR output is world-space or already in the projector's XY basis. */
import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();
const body = kernel.makeBox(40, 60, 15);
for (const [name, direction, xAxis] of [
  ['front', { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }],
  ['top', { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }],
  ['right', { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
] as const) {
  const projection = kernel.projectEdges(body, { x: 0, y: 0, z: 0 }, direction, xAxis);
  const lines = kernel.wireframe(projection.visibleSharp, 0.01);
  console.log(name, Array.from(lines.points), Array.from(lines.edgeGroups));
  for (const h of Object.values(projection)) if (Number(h) !== 0) kernel.release(h);
}
kernel.releaseAll();
