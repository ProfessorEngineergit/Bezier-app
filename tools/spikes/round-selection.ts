/**
 * Spike: exact circular rims versus their mesh samples, filleting rims, and resizing holes.
 * Run with node --experimental-strip-types.
 */
import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();
const cylinder = kernel.makeCylinder(10, 10);
const faces = kernel.getSubShapes(cylinder, 'face');
console.log(
  'Exact faces:',
  faces.map((f) => kernel.surfaceType(f)),
);
const mesh = kernel.meshShape(cylinder);
console.log('Mesh face groups:', Array.from(mesh.faceGroups ?? []));
for (let i = 0; i < faces.length; i++)
  for (let j = i + 1; j < faces.length; j++) {
    const a = faces[i],
      b = faces[j];
    if (a === undefined || b === undefined) continue;
    const edges = kernel.sharedEdges(a, b);
    for (const edge of edges) {
      const rounded = kernel.fillet(cylinder, [edge], 1);
      console.log('Roundable rim:', i, j, kernel.curveType(edge), kernel.isValid(rounded));
      kernel.release(rounded);
      kernel.release(edge);
    }
  }
const box = kernel.translate(kernel.makeBox(30, 30, 10), -15, -15, 0);
const hole = kernel.cut(box, kernel.makeCylinder(5, 10));
const wide = kernel.cut(hole, kernel.makeCylinder(7, 10));
const sleeve = kernel.cut(kernel.makeCylinder(7, 10), kernel.makeCylinder(4, 10));
const small = kernel.fuse(wide, sleeve);
console.log(
  'Hole radii after resizing:',
  [hole, wide, small].map((s) =>
    kernel.getSubShapes(s, 'face').flatMap((f) => kernel.getFaceCylinderData(f)?.radius ?? []),
  ),
);
console.log(
  'Valid:',
  [hole, wide, small].map((s) => kernel.isValid(s)),
);
kernel[Symbol.dispose]();
