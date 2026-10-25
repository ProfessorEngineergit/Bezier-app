/**
 * Progress for opening a project. The engine reports nothing until replay is done, so the estimate
 * is the duration of the last open on this device; the bar slows near the end and never completes
 * early. A first open shows an indeterminate bar.
 */

const KEY = 'bezier.open-ms';
/** The bar never passes this until the project is actually open. */
const HELD_BACK = 0.97;
/** Linear up to here; after it the bar only creeps. */
const STRAIGHT = 0.9;

type Times = Record<string, number>;

function read(): Times {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw !== null && typeof raw === 'object' ? (raw as Times) : {};
  } catch {
    return {};
  }
}

/** Duration of this project's last open in milliseconds, or null if never opened here. */
export function lastOpenTook(id: string): number | null {
  const took = read()[id];
  return typeof took === 'number' && Number.isFinite(took) && took > 0 ? took : null;
}

export function rememberOpenTook(id: string, milliseconds: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: Math.round(milliseconds) }));
  } catch {
    // Not stored: the next open shows an indeterminate bar.
  }
}

/** The fraction to show after `elapsed` of an open expected to take `expected`. */
export function openFraction(elapsed: number, expected: number): number {
  if (expected <= 0 || elapsed <= 0) return 0;
  const linear = elapsed / expected;
  if (linear <= STRAIGHT) return linear;
  // Slower than last time: keep creeping towards `HELD_BACK`.
  const over = linear - STRAIGHT;
  return STRAIGHT + (HELD_BACK - STRAIGHT) * (1 - Math.exp(-over * 3));
}
