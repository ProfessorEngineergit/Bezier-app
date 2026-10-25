/**
 * Marquee selection of project cards on the start page. Pure geometry so it is testable in Node;
 * `use-card-selection.ts` supplies pointer and card boxes.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The rectangle between two points, whichever way it was dragged. */
export function boxBetween(ax: number, ay: number, bx: number, by: number): Box {
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    right: Math.max(ax, bx),
    bottom: Math.max(ay, by),
  };
}

/** Whether two boxes overlap at all; touching a card selects it. */
export function touches(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * The selection a rectangle makes: the cards it touches, added to the previous selection when the
 * drag started with Shift or Command.
 */
export function marqueeSelection(
  marquee: Box,
  cards: readonly { id: string; box: Box }[],
  before: ReadonlySet<string>,
  additive: boolean,
): Set<string> {
  const next = new Set(additive ? before : []);
  for (const card of cards) if (touches(marquee, card.box)) next.add(card.id);
  return next;
}
