/**
 * Converts a solved sketch into kernel profiles: each region from `regions.ts` as exact curve
 * segments on the sketch plane.
 */

import type { Profile } from '@bezier/kernel';
import type { Sketch, SolveResult } from '@bezier/solver';
import { type PlaneBasis, planeBasis } from './plane.js';
import { type SketchRegion, sketchRegions } from './regions.js';

/** One sketch region as a kernel profile. */
export interface SketchProfile {
  /** The region's stable key, stored by features that use it. */
  key: string;
  profile: Profile;
}

export type ProfilesResult =
  | { ok: true; profiles: readonly SketchProfile[]; regions: readonly SketchRegion[] }
  | { ok: false; message: string };

/** All regions of a solved sketch as profiles. An open sketch returns none, not an error. */
export function sketchProfiles(
  sketch: Sketch,
  solved: SolveResult,
  plane: string | PlaneBasis,
): ProfilesResult {
  const placement = typeof plane === 'string' ? planeBasis(plane) : plane;
  if (placement === null) {
    return { ok: false, message: `Unknown sketch plane "${String(plane)}".` };
  }

  const regions = sketchRegions(sketch, {
    point: (id) => solved.positions.get(id) ?? null,
    radius: (circle, drawn) => solved.radii.get(circle) ?? drawn,
  });
  return {
    ok: true,
    regions,
    profiles: regions.map((region) => ({
      key: region.key,
      profile: {
        loops: region.loops,
        origin: placement.origin,
        normal: placement.normal,
        xDirection: placement.xDirection,
      },
    })),
  };
}
