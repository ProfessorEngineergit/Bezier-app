/**
 * Loft and sweep (ADR 0017, audit F-032, F-033), built from the same exact segments as profiles
 * (`profile-face.ts`). Only a profile's outline is used; holes are not carried.
 */
import type { Profile } from './kernel.js';
import { wireOfLoop } from './profile-face.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/** The outline of a profile as a wire. */
function outline(occt: RawKernel, profile: Profile): RawHandle {
  const [outer] = profile.loops;
  if (outer === undefined || outer.length === 0) throw new Error('A profile needs an outline.');
  return wireOfLoop(occt, profile, outer);
}

/** A solid through the outlines of `profiles`, in order. The caller owns the result. */
export function loftThrough(
  occt: RawKernel,
  profiles: readonly Profile[],
  ruled: boolean,
): RawHandle {
  if (profiles.length < 2) throw new Error('A loft needs two sections.');
  const wires = profiles.map((profile) => outline(occt, profile));
  try {
    return occt.loft(wires, true, ruled);
  } finally {
    for (const wire of wires) occt.release(wire);
  }
}

/**
 * `profile`'s outline carried along `path`, whose one loop is the chain of segments in order (open
 * or closed). The caller owns the result.
 */
export function sweepAlong(occt: RawKernel, profile: Profile, path: Profile): RawHandle {
  const [chain] = path.loops;
  if (chain === undefined || chain.length === 0) throw new Error('The path has nothing to follow.');
  const spine = wireOfLoop(occt, path, chain);
  const wire = outline(occt, profile);
  try {
    // Corrected Frenet: the section keeps its angle to the path without twisting about it.
    return occt.sweepOriented(wire, spine, 0);
  } finally {
    occt.release(wire);
    occt.release(spine);
  }
}
