/** One presentation renderer per canvas, claimed and released by the Visualize workspace. */
import { createPresentation, type PresentationRenderer } from '@bezier/renderer';

/**
 * A canvas has one WebGL/WebGPU context, so a remount (React's development double-mount, or a
 * quick switch away and back) must reuse the renderer rather than build a second and dispose the
 * first, which would lose the shared context.
 */
export interface Claim {
  promise: Promise<PresentationRenderer>;
  users: number;
}
const claims = new WeakMap<HTMLCanvasElement, Claim>();

export function claimPresentation(canvas: HTMLCanvasElement): Claim {
  let claim = claims.get(canvas);
  if (!claim) {
    claim = { promise: createPresentation(canvas), users: 0 };
    claims.set(canvas, claim);
  }
  claim.users++;
  return claim;
}

export function releasePresentation(canvas: HTMLCanvasElement, claim: Claim) {
  claim.users--;
  // Deferred, so a remount in the same tick can claim it first.
  setTimeout(() => {
    if (claim.users > 0 || claims.get(canvas) !== claim) return;
    claims.delete(canvas);
    void claim.promise.then((r) => r.dispose()).catch(() => {});
  }, 0);
}
