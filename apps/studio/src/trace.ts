/**
 * Timing of the stages of a change (journal write, kernel rebuild, body list, display, GPU upload)
 * as `performance.measure` entries named `bezier:…`. Visible in the browser's performance panel and
 * read by the large-model benchmark. The buffer is cleared as it fills.
 */

const LIMIT = 500;
let recorded = 0;

/** Times `work` under `name`, however it ends. */
export async function traced<T>(name: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    recorded += 1;
    if (recorded > LIMIT) {
      performance.clearMeasures();
      recorded = 1;
    }
    performance.measure(`bezier:${name}`, { start, end: performance.now() });
  }
}
