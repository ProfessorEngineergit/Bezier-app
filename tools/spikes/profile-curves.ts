/**
 * Spike: can exact circle and arc edges form faces and extrude through OCCT?
 *
 * Run: node --experimental-strip-types tools/spikes/profile-curves.ts
 *
 * Result (occt-wasm 3.8.3 / OCCT 8.0.1):
 *
 *   1. A one-edge circle wire becomes a planar face and extrudes to a three-face solid with a
 *      cylindrical side.
 *   2. An arc can share a wire with line edges; a semicircular cap plus three lines extrudes to a
 *      valid solid.
 *   3. Edges keep their exact Circle curve type, so the kernel Profile can carry exact segments
 *      without approximating curves.
 */

import { OcctKernel, type ShapeHandle } from 'occt-wasm';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function releaseAll(kernel: OcctKernel, shapes: readonly ShapeHandle[]): void {
  for (const shape of shapes) kernel.release(shape);
}

async function main(): Promise<void> {
  const kernel = await OcctKernel.init();

  const circle = kernel.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 12);
  const circleWire = kernel.makeWire([circle]);
  const circleFace = kernel.makeFace(circleWire);
  const cylinder = kernel.extrude(circleFace, 0, 0, 20);
  const cylinderFaces = kernel.getSubShapes(cylinder, 'face');
  const cylinderKinds = cylinderFaces.map((face) => String(kernel.surfaceType(face)));
  assert(cylinderFaces.length === 3, `circle extrusion returned ${cylinderFaces.length} faces`);
  assert(cylinderKinds.includes('cylinder'), `circle side was ${cylinderKinds.join(', ')}`);
  assert(String(kernel.curveType(circle)) === 'circle', 'circle edge lost its exact curve type');

  const arc = kernel.makeArcEdge(
    { x: -10, y: 0, z: 0 },
    { x: 0, y: 10, z: 0 },
    { x: 10, y: 0, z: 0 },
  );
  const right = kernel.makeLineEdge({ x: 10, y: 0, z: 0 }, { x: 10, y: -10, z: 0 });
  const bottom = kernel.makeLineEdge({ x: 10, y: -10, z: 0 }, { x: -10, y: -10, z: 0 });
  const left = kernel.makeLineEdge({ x: -10, y: -10, z: 0 }, { x: -10, y: 0, z: 0 });
  const mixedWire = kernel.makeWire([arc, right, bottom, left]);
  const mixedFace = kernel.makeFace(mixedWire);
  const mixedSolid = kernel.extrude(mixedFace, 0, 0, 20);
  const mixedFaces = kernel.getSubShapes(mixedSolid, 'face');
  const mixedKinds = mixedFaces.map((face) => String(kernel.surfaceType(face)));
  assert(mixedFaces.length === 6, `mixed extrusion returned ${mixedFaces.length} faces`);
  assert(mixedKinds.includes('cylinder'), `arc side was ${mixedKinds.join(', ')}`);
  assert(String(kernel.curveType(arc)) === 'circle', 'arc edge lost its exact curve type');

  console.log(`circle: ${cylinderKinds.join(', ')}`);
  console.log(`mixed: ${mixedKinds.join(', ')}`);
  console.log('PASS — exact circle and arc segments form extrudable OCCT faces');

  releaseAll(kernel, [...cylinderFaces, cylinder, ...mixedFaces, mixedSolid]);
  kernel[Symbol.dispose]();
}

await main();
