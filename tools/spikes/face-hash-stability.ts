/**
 * Spike: do OCCT face hashes survive a rebuild, and can geometry identify a face? (ADR 0001)
 *
 * Run:  node --experimental-strip-types tools/spikes/face-hash-stability.ts
 *
 * Result (occt-wasm 3.8.3 / OCCT 8.0.1):
 *
 *   1. Rebuilding the same box in the same session preserves 0/6 hashes; they derive from
 *      allocation, not geometry.
 *   2. A fresh kernel instance preserves 6/6, but only because a clean arena allocates the same
 *      addresses in the same order. Any earlier allocation breaks this.
 *   3. Widening a 40x60x15 box to 50x60x15 keeps area and centroid for only 1 of 6 faces, so
 *      geometry cannot be the key either.
 *
 *   Identity therefore comes from provenance (producing feature and output index) carried through
 *   EvolutionData, with the geometric signature as a tie-breaker only. See
 *   packages/core/src/stable-ref.ts.
 */

import { OcctKernel } from 'occt-wasm';

/** Upper bound for OCCT's HashCode(); a prime gives a better distribution. */
const HASH_UPPER_BOUND = 1_000_003;

type Vec3 = { x: number; y: number; z: number };

interface FaceSignature {
  hash: number;
  surfaceType: string;
  area: number;
  centre: Vec3;
}

function round(n: number, dp = 4): number {
  return Number.parseFloat(n.toFixed(dp));
}

/** Geometric fingerprint of a face, independent of its storage. */
function signatureKey(s: FaceSignature): string {
  return [
    s.surfaceType,
    round(s.area),
    round(s.centre.x),
    round(s.centre.y),
    round(s.centre.z),
  ].join('|');
}

/** Builds a box of the given width and returns a signature for each face. */
function describeBox(kernel: OcctKernel, width: number): FaceSignature[] {
  const mark = kernel.checkpoint();
  const solid = kernel.makeBox(width, 60, 15);
  const faces = kernel.getSubShapes(solid, 'face');

  const signatures = faces.map(
    (face) =>
      ({
        hash: kernel.hashCode(face, HASH_UPPER_BOUND),
        surfaceType: String(kernel.surfaceType(face)),
        area: kernel.getSurfaceArea(face),
        centre: kernel.getSurfaceCenterOfMass(face),
      }) satisfies FaceSignature,
  );

  kernel.releaseSince(mark);
  return signatures;
}

function overlap(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

function line(label: string, matched: number, total: number): void {
  console.log(`  ${matched === total ? 'stable  ' : 'UNSTABLE'}  ${label}: ${matched}/${total}`);
}

async function main(): Promise<void> {
  console.log('OCCT face-hash stability spike (occt-wasm 3.8.3)\n');

  const kernel = await OcctKernel.init();

  const first = describeBox(kernel, 40);
  const rebuilt = describeBox(kernel, 40);
  const widened = describeBox(kernel, 50);

  const hashesA = first.map((f) => String(f.hash));
  const sigA = first.map(signatureKey);

  console.log('Q1 — identical rebuild, same kernel session (the realistic case):');
  line(
    'hashes preserved',
    overlap(
      hashesA,
      rebuilt.map((f) => String(f.hash)),
    ),
    6,
  );
  line('signatures preserved', overlap(sigA, rebuilt.map(signatureKey)), 6);

  console.log('\nQ2 — parameter change 40 -> 50 mm, topology unchanged:');
  console.log(
    `  hashes preserved:     ${overlap(
      hashesA,
      widened.map((f) => String(f.hash)),
    )}/6`,
  );
  console.log(`  signatures preserved: ${overlap(sigA, widened.map(signatureKey))}/6`);
  console.log(
    '  Only the x=0 face keeps both its area and its centroid. Widening moves or\n' +
      '  resizes the other five — though a user would say all six are still there.',
  );

  kernel[Symbol.dispose]();

  console.log('\nQ3 — identical rebuild in a FRESH kernel instance:');
  const kernel2 = await OcctKernel.init();
  const afterRestart = describeBox(kernel2, 40);
  line(
    'hashes preserved',
    overlap(
      hashesA,
      afterRestart.map((f) => String(f.hash)),
    ),
    6,
  );
  line('signatures preserved', overlap(sigA, afterRestart.map(signatureKey)), 6);
  console.log(
    '  Do not read this as stability. A clean arena hands out the same addresses\n' +
      '  in the same order, so the hashes merely repeat. Q1 is the honest test,\n' +
      '  and Q1 says they do not survive.',
  );
  kernel2[Symbol.dispose]();

  console.log(
    '\n--- verdict ---\n' +
      'Neither hashes nor geometry can serve as the identity of a face.\n' +
      'Identity must be provenance: which feature made this face, and which of\n' +
      "that feature's outputs it is, carried forward through EvolutionData.\n" +
      'Geometric signature is a tie-breaker only.',
  );
}

main().catch((error: unknown) => {
  console.error('spike failed:', error);
  process.exitCode = 1;
});
