/**
 * Feature-level merge inside one project. Pure, like merge.ts.
 *
 * A project is `{ meta, features: [{ id, ... }] }` (packages/core/src/document.ts). Features
 * are matched by id; ids are minted per edit (`sketch-<timestamp>`), so independent additions
 * do not collide. Features refer to each other by stable reference (`F:extrude-1:side-2`); if
 * the other side removed a referenced face, the rebuild marks the feature broken rather than
 * failing the merge.
 *
 * Anything both sides changed differently is a conflict; the caller then keeps both versions
 * of the project (repository.ts).
 */

export interface FeatureLike {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface DocumentLike {
  readonly meta: Readonly<Record<string, unknown>>;
  readonly features: readonly FeatureLike[];
  readonly [key: string]: unknown;
}

export interface DocumentConflict {
  /** `feature:<id>`, `meta:<key>` or `<key>` for anything else at the top level. */
  readonly path: string;
  readonly reason: 'both-changed' | 'changed-and-deleted' | 'both-added';
}

export interface DocumentMergeResult {
  readonly document: DocumentLike;
  readonly conflicts: readonly DocumentConflict[];
}

/** Whether bytes look like a Bezier project this merge understands. */
export function asDocument(value: unknown): DocumentLike | null {
  if (value === null || typeof value !== 'object') return null;
  const doc = value as { meta?: unknown; features?: unknown };
  if (doc.meta === null || typeof doc.meta !== 'object' || !Array.isArray(doc.features))
    return null;
  const ids = new Set<string>();
  for (const f of doc.features as unknown[]) {
    const id = (f as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || ids.has(id)) return null;
    ids.add(id);
  }
  return value as DocumentLike;
}

export function mergeDocuments(
  base: DocumentLike,
  ours: DocumentLike,
  theirs: DocumentLike,
): DocumentMergeResult {
  const conflicts: DocumentConflict[] = [];
  const meta = mergeRecord(base.meta, ours.meta, theirs.meta, 'meta:', conflicts);
  // Every edit touches modifiedAt, so it would always conflict; the later one wins.
  const om = ours.meta.modifiedAt;
  const tm = theirs.meta.modifiedAt;
  if (typeof om === 'string' && typeof tm === 'string') {
    meta.modifiedAt = om > tm ? om : tm;
    removeConflict(conflicts, 'meta:modifiedAt');
  }

  const features = mergeFeatures(base.features, ours.features, theirs.features, conflicts);

  const rest: Record<string, unknown> = {};
  const others = (d: DocumentLike) => without(d, ['meta', 'features']);
  Object.assign(rest, mergeRecord(others(base), others(ours), others(theirs), '', conflicts));

  return { document: { ...rest, meta, features }, conflicts };
}

function mergeFeatures(
  base: readonly FeatureLike[],
  ours: readonly FeatureLike[],
  theirs: readonly FeatureLike[],
  conflicts: DocumentConflict[],
): FeatureLike[] {
  const b = byId(base);
  const o = byId(ours);
  const t = byId(theirs);
  const kept = new Map<string, FeatureLike>();

  for (const id of new Set([...o.keys(), ...t.keys(), ...b.keys()])) {
    const bf = b.get(id);
    const of = o.get(id);
    const tf = t.get(id);
    const path = `feature:${id}`;
    if (of !== undefined && tf !== undefined) {
      if (same(of, tf)) kept.set(id, of);
      else if (bf !== undefined && same(of, bf)) kept.set(id, tf);
      else if (bf !== undefined && same(tf, bf)) kept.set(id, of);
      else if (bf !== undefined) {
        // Both changed the feature: merge field by field. Only the same field changed
        // differently on both sides conflicts.
        const fields = mergeRecord(bf, of, tf, `${path}.`, conflicts);
        kept.set(id, { ...fields, id } as FeatureLike);
      } else {
        conflicts.push({ path, reason: 'both-added' });
        kept.set(id, of);
      }
    } else if (of !== undefined || tf !== undefined) {
      const present = of ?? tf;
      if (present === undefined) continue;
      if (bf === undefined)
        kept.set(id, present); // Added on one side.
      else if (!same(present, bf)) {
        // Deleted on one side, edited on the other.
        conflicts.push({ path, reason: 'changed-and-deleted' });
        kept.set(id, present);
      }
      // Otherwise deleted on one side and untouched on the other: stays deleted.
    }
  }

  // Order is history. Take the order of whichever side reordered (or ours), then insert
  // features only the other side added after the feature that preceded them there.
  const baseOrder = base.map((f) => f.id).filter((id) => o.has(id) && t.has(id));
  const oursOrder = ours.map((f) => f.id).filter((id) => b.has(id) && t.has(id));
  const oursReordered = oursOrder.join() !== baseOrder.join();
  const [spine, other] = oursReordered ? [ours, theirs] : [theirs, ours];

  const order = spine.map((f) => f.id).filter((id) => kept.has(id));
  const placed = new Set(order);
  for (let i = 0; i < other.length; i++) {
    const id = other[i]?.id;
    if (id === undefined || placed.has(id) || !kept.has(id)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const before = other[j]?.id;
      const index = before === undefined ? -1 : order.indexOf(before);
      if (index >= 0) {
        at = index + 1;
        break;
      }
    }
    order.splice(at, 0, id);
    placed.add(id);
  }
  return order.map((id) => kept.get(id)).filter((f): f is FeatureLike => f !== undefined);
}

function mergeRecord(
  base: Readonly<Record<string, unknown>>,
  ours: Readonly<Record<string, unknown>>,
  theirs: Readonly<Record<string, unknown>>,
  prefix: string,
  conflicts: DocumentConflict[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
    const [b, o, t] = [base[key], ours[key], theirs[key]];
    let value: unknown;
    if (same(o, t)) value = o;
    else if (same(o, b)) value = t;
    else if (same(t, b)) value = o;
    else {
      conflicts.push({ path: `${prefix}${key}`, reason: 'both-changed' });
      value = o;
    }
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function byId(features: readonly FeatureLike[]): Map<string, FeatureLike> {
  return new Map(features.map((f) => [f.id, f]));
}

function without(doc: DocumentLike, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([k]) => !keys.includes(k)));
}

function removeConflict(conflicts: DocumentConflict[], path: string): void {
  const index = conflicts.findIndex((c) => c.path === path);
  if (index >= 0) conflicts.splice(index, 1);
}

/** Structural equality with key order ignored: two sides serialise objects differently. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  const ak = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bk = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ak.length !== bk.length) return false;
  return ak.every((k) =>
    same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
