/** Compare raw surface and tessellation normals before using them for direct face edits. */
import { OcctKernel } from 'occt-wasm';

const kernel = await OcctKernel.init();
const body = kernel.makeBox(40, 60, 15);
for (const face of kernel.getSubShapes(body, 'face')) {
  console.log({
    centre: kernel.getSurfaceCenterOfMass(face),
    orientation: kernel.shapeOrientation(face),
    surface: kernel.surfaceNormal(face, 0, 0),
    mesh: Array.from(kernel.meshShape(face).normals.slice(0, 3)),
  });
}
kernel.releaseAll();
