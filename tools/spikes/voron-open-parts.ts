/**
 * Spike: find parts of an imported assembly that mesh open (faces without triangles, unclosed
 * surfaces) or with flipped winding. On the Voron, three curved clips render as bare sheets.
 * Run: bench/node_modules/.bin/tsx tools/spikes/voron-open-parts.ts <file.step> [linear angular]
 */
import { readFileSync } from 'node:fs';
import { solidsFromIges } from '../../packages/kernel/src/iges.ts';
import { solidLeaves } from '../../packages/kernel/src/tessellation.ts';
import { loadOcct } from '../../packages/kernel/src/wasm.ts';

const [file, lin = '0.2', ang = '0.5'] = process.argv.slice(2);
const occt = await loadOcct();
const text = readFileSync(file ?? '', 'latin1');
const root = solidsFromIges(occt, occt.importStep(text));
const leaves = solidLeaves(occt, root) ?? [root];
console.log('leaves', leaves.length);

const types = new Map<string, number>();
const bad: string[] = [];
leaves.forEach((leaf, i) => {
  const type = occt.getShapeType(leaf);
  types.set(type, (types.get(type) ?? 0) + 1);
  const faces = occt.subShapeCount(leaf, 'face');
  const mesh = occt.meshShape(leaf, {
    linearDeflection: Number(lin),
    angularDeflection: Number(ang),
  });
  const groups = (mesh.faceGroups?.length ?? 0) / 3;
  const tris = mesh.indices.length / 3;
  // Count boundary edges after welding coincident vertices.
  const key = (k: number) =>
    `${Math.round((mesh.positions[k] ?? 0) * 1e3)},${Math.round((mesh.positions[k + 1] ?? 0) * 1e3)},${Math.round((mesh.positions[k + 2] ?? 0) * 1e3)}`;
  const id = new Map<string, number>();
  const idOf = (v: number) => {
    const k = key(v * 3);
    let r = id.get(k);
    if (r === undefined) {
      r = id.size;
      id.set(k, r);
    }
    return r;
  };
  const edges = new Map<string, number>();
  for (let t = 0; t < tris; t++) {
    const a = idOf(mesh.indices[t * 3] ?? 0);
    const b = idOf(mesh.indices[t * 3 + 1] ?? 0);
    const c = idOf(mesh.indices[t * 3 + 2] ?? 0);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const e = p < q ? `${p}_${q}` : `${q}_${p}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const n of edges.values()) if (n === 1) open++;
  const valid = occt.isValid(leaf);
  // Triangles wound against their normals get culled or render black.
  let flipped = 0;
  let volume = 0;
  for (let t = 0; t < tris; t++) {
    const i0 = (mesh.indices[t * 3] ?? 0) * 3;
    const i1 = (mesh.indices[t * 3 + 1] ?? 0) * 3;
    const i2 = (mesh.indices[t * 3 + 2] ?? 0) * 3;
    const P = mesh.positions;
    const N = mesh.normals;
    const ux = (P[i1] ?? 0) - (P[i0] ?? 0),
      uy = (P[i1 + 1] ?? 0) - (P[i0 + 1] ?? 0),
      uz = (P[i1 + 2] ?? 0) - (P[i0 + 2] ?? 0);
    const vx = (P[i2] ?? 0) - (P[i0] ?? 0),
      vy = (P[i2 + 1] ?? 0) - (P[i0 + 1] ?? 0),
      vz = (P[i2 + 2] ?? 0) - (P[i0 + 2] ?? 0);
    const cx = uy * vz - uz * vy,
      cy = uz * vx - ux * vz,
      cz = ux * vy - uy * vx;
    const dot = cx * (N[i0] ?? 0) + cy * (N[i0 + 1] ?? 0) + cz * (N[i0 + 2] ?? 0);
    if (dot < 0) flipped++;
    volume += ((P[i0] ?? 0) * cx + (P[i0 + 1] ?? 0) * cy + (P[i0 + 2] ?? 0) * cz) / 6;
  }
  if (flipped > 0 || (type === 'solid' && volume < 0)) {
    bad.push(
      `#${i} ${type} faces ${faces} tris ${tris} FLIPPED ${flipped} volume ${volume.toFixed(1)} valid ${valid}`,
    );
  }
  if (groups < faces || (type === 'solid' && open > 20)) {
    bad.push(
      `#${i} ${type} faces ${faces} meshedFaces ${groups} tris ${tris} openEdges ${open} valid ${valid}`,
    );
  }
});
console.log([...types]);
console.log('suspicious parts:', bad.length);
for (const line of bad.slice(0, 80)) console.log(line);
