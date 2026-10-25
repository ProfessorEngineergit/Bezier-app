/**
 * Stored in browser storage: whether the user has been greeted and which guides are finished.
 * Storage may be missing or throw (private windows), so every access may fail; Nib then asks again.
 */

const KEY = 'bezier.nib';

export interface Memory {
  /** The greeting was shown. */
  met: boolean;
  /** Ids of guides finished or skipped. */
  guides: readonly string[];
}

const EMPTY: Memory = { met: false, guides: [] };

export function recall(storage: Pick<Storage, 'getItem'> | null): Memory {
  if (storage === null) return EMPTY;
  try {
    const stored: unknown = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (typeof stored !== 'object' || stored === null) return EMPTY;
    const record = stored as Record<string, unknown>;
    const guides = Array.isArray(record.guides)
      ? record.guides.filter((id): id is string => typeof id === 'string')
      : [];
    return { met: record.met === true, guides };
  } catch {
    return EMPTY;
  }
}

export function remember(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  memory: Memory,
): void {
  if (storage === null) return;
  try {
    storage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Ignore; he will ask again.
  }
}
