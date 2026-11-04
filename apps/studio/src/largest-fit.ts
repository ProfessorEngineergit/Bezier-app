/**
 * The largest size that still fits, found by trying: OCCT has no way to ask. Halving nine times
 * lands within a quarter of a percent of the refused size, which is enough to offer a number.
 */

const TRIES = 9;

/** Down to a number worth reading: a tenth of a millimetre, or a hundredth below one. */
function readable(size: number): number {
  const step = size >= 1 ? 0.1 : 0.01;
  return Math.floor(size / step + 1e-9) * step;
}

/** The largest size up to `refused` that `fits`, or null when no size does. */
export async function largestFit(
  refused: number,
  fits: (size: number) => Promise<boolean>,
): Promise<number | null> {
  let good = 0;
  let bad = refused;
  for (let i = 0; i < TRIES; i += 1) {
    const middle = (good + bad) / 2;
    if (await fits(middle)) good = middle;
    else bad = middle;
  }
  const offered = Number(readable(good).toFixed(2));
  if (offered > 0 && (await fits(offered))) return offered;
  return good > 0 ? Number(good.toFixed(3)) : null;
}
