/**
 * Firsts Nib notices: the first sketch, solid, rounded edge and export, each once per machine.
 * Not during a lesson, which ends with its own message.
 */

import type { IslandEvent } from './island-feed.js';

export const MILESTONES_KEY = 'bezier.nib.firsts';

interface First {
  id: string;
  text: string;
  test: (event: IslandEvent) => boolean;
}

const added = (types: readonly string[]) => (event: IslandEvent) =>
  event.kind === 'edit' &&
  event.op === 'addFeature' &&
  event.type !== undefined &&
  types.includes(event.type);

const FIRSTS: readonly First[] = [
  { id: 'sketch', text: 'Your first sketch.', test: added(['sketch']) },
  {
    id: 'solid',
    text: 'Your first solid. It is real now.',
    test: added(['extrude', 'revolve', 'loft', 'sweep']),
  },
  { id: 'round', text: 'First rounded edge. Softer already.', test: added(['fillet', 'chamfer']) },
  {
    id: 'export',
    text: 'Your first export. It can leave the app now.',
    test: (event) =>
      event.kind === 'notice' && event.tone === 'ok' && /^Exported /.test(event.title),
  },
];

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

function recall(storage: Store): Set<string> {
  try {
    const stored = JSON.parse(storage?.getItem(MILESTONES_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Returns what to say if this event is a first. Records it right away, so it is said only once
 * even if the island drops it while busy.
 */
export function firstOf(event: IslandEvent, storage: Store, guiding: boolean): string | null {
  const first = FIRSTS.find((candidate) => candidate.test(event));
  if (first === undefined) return null;
  const seen = recall(storage);
  if (seen.has(first.id)) return null;
  seen.add(first.id);
  try {
    storage?.setItem(MILESTONES_KEY, JSON.stringify([...seen]));
  } catch {
    // Private mode: it may be said again next time, the lesser harm.
  }
  return guiding ? null : first.text;
}
