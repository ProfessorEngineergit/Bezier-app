/**
 * Memoised parsing of face names into references; large assemblies parse ~108,000 names per
 * rebuild. Bounded: the cache is cleared when it reaches the limit.
 */

import { parseRef, type StableRef } from '../stable-ref.js';

const LIMIT = 1_000_000;
const parsed = new Map<string, StableRef | null>();

/** The reference for a face name, or null if it cannot be parsed. */
export function readRef(name: string): StableRef | null {
  const known = parsed.get(name);
  if (known !== undefined) return known;
  if (parsed.size >= LIMIT) parsed.clear();
  let ref: StableRef | null;
  try {
    ref = parseRef(name);
  } catch {
    // An unparsable name is a bug elsewhere; do not let it affect other faces.
    ref = null;
  }
  parsed.set(name, ref);
  return ref;
}
