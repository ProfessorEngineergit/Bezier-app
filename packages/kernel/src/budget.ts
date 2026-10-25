/**
 * How long a STEP import may take before it counts as stuck. Reading is linear in file size and
 * slow (97 MB took 87 s in `importStep` on an Apple Silicon Mac, in Node), so the budget is ten
 * times the measured rate plus a floor; three times was too little for a two-core VM reading the
 * 241 MB Voron. A truly stopped engine is still detected, and Escape cancels a long read.
 */

/** Measured about 1.1 MB/s of STEP text on a fast Mac; this allows ten times slower. */
const IMPORT_MS_PER_MB = 10_000;
const IMPORT_FLOOR_MS = 30_000;
/** Past this the file is not going to finish on any machine it will meet. */
const IMPORT_CEILING_MS = 60 * 60_000;

export function importBudgetMs(characters: number): number {
  const megabytes = characters / 1_000_000;
  return Math.min(IMPORT_CEILING_MS, IMPORT_FLOOR_MS + megabytes * IMPORT_MS_PER_MB);
}
