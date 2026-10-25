/**
 * The trilinear hexahedron element. All voxels are the same cube, so one matrix serves the whole
 * solve: for edge length h it is `h · K(1)` (B scales with 1/h, volume with h³).
 */

/** Local node positions, the usual counter-clockwise order, bottom then top. */
export const HEX_NODES: readonly (readonly [0 | 1, 0 | 1, 0 | 1])[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

/** Isotropic elasticity in Voigt order xx, yy, zz, xy, yz, zx (engineering shear). */
export function elasticity(youngsModulus: number, poissonRatio: number): Float64Array {
  const e = youngsModulus,
    nu = poissonRatio;
  const lambda = (e * nu) / ((1 + nu) * (1 - 2 * nu));
  const mu = e / (2 * (1 + nu));
  const d = new Float64Array(36);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) d[r * 6 + c] = lambda + (r === c ? 2 * mu : 0);
  for (let r = 3; r < 6; r++) d[r * 6 + r] = mu;
  return d;
}

/**
 * Strain-displacement matrix (6×24, row-major) at natural coordinates, for a
 * cube of edge `h`.
 */
export function strainMatrix(xi: number, eta: number, zeta: number, h: number): Float64Array {
  const b = new Float64Array(6 * 24);
  const scale = 2 / h; // dξ/dx for a cube
  for (let n = 0; n < 8; n++) {
    const [a, bb, c] = HEX_NODES[n] as readonly [number, number, number];
    const sx = 2 * a - 1,
      sy = 2 * bb - 1,
      sz = 2 * c - 1;
    const dx = (scale * sx * (1 + eta * sy) * (1 + zeta * sz)) / 8;
    const dy = (scale * sy * (1 + xi * sx) * (1 + zeta * sz)) / 8;
    const dz = (scale * sz * (1 + xi * sx) * (1 + eta * sy)) / 8;
    const col = n * 3;
    b[0 * 24 + col] = dx;
    b[1 * 24 + col + 1] = dy;
    b[2 * 24 + col + 2] = dz;
    b[3 * 24 + col] = dy;
    b[3 * 24 + col + 1] = dx;
    b[4 * 24 + col + 1] = dz;
    b[4 * 24 + col + 2] = dy;
    b[5 * 24 + col] = dz;
    b[5 * 24 + col + 2] = dx;
  }
  return b;
}

/** 24×24 element stiffness for a cube of edge `h`, 2×2×2 Gauss. */
export function hex8Stiffness(
  youngsModulus: number,
  poissonRatio: number,
  h: number,
): Float64Array {
  const d = elasticity(youngsModulus, poissonRatio);
  const k = new Float64Array(576);
  const g = 1 / Math.sqrt(3);
  const detJ = (h / 2) ** 3;
  const db = new Float64Array(6 * 24);
  for (const xi of [-g, g])
    for (const eta of [-g, g])
      for (const zeta of [-g, g]) {
        const b = strainMatrix(xi, eta, zeta, h);
        // DB first, then Bᵀ(DB): 6·6·24 + 24·24·6 multiplies instead of the naive triple loop.
        for (let r = 0; r < 6; r++)
          for (let c = 0; c < 24; c++) {
            let sum = 0;
            for (let m = 0; m < 6; m++) sum += (d[r * 6 + m] as number) * (b[m * 24 + c] as number);
            db[r * 24 + c] = sum;
          }
        for (let r = 0; r < 24; r++)
          for (let c = 0; c < 24; c++) {
            let sum = 0;
            for (let m = 0; m < 6; m++)
              sum += (b[m * 24 + r] as number) * (db[m * 24 + c] as number);
            k[r * 24 + c] = (k[r * 24 + c] as number) + sum * detJ;
          }
      }
  return k;
}
