/**
 * Shift-click range selection in the Items panel, as in any list: from the last row clicked to this
 * one, and everything between. Cmd or Ctrl toggles a single row.
 */

/**
 * The keys from `anchor` to `key` in list order, both included; null when there is no anchor or
 * either key is no longer listed (a folder closed, a body removed).
 */
export function rangeBetween(
  order: readonly string[],
  anchor: string | null,
  key: string,
): string[] | null {
  if (anchor === null) return null;
  const from = order.indexOf(anchor);
  const to = order.indexOf(key);
  if (from < 0 || to < 0) return null;
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}
