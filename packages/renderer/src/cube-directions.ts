/**
 * Which directions the orientation cube has: six faces, twelve edges and eight corners. A view
 * is parallel only in one of them (`scene.ts`): anywhere else a parallel projection would draw
 * the grid at a slant with its lines running off to nowhere.
 */

/** A direction counts as one of the cube's when it is within about two degrees of it. */
const CUBE_COS = Math.cos((2 * Math.PI) / 180);

/** Whether `normal` points at a face, an edge or a corner of the orientation cube. */
export function onTheCube(normal: { x: number; y: number; z: number }, length: number): boolean {
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const dot = normal.x * x + normal.y * y + normal.z * z;
        if (dot > length * Math.hypot(x, y, z) * CUBE_COS) return true;
      }
  return false;
}
