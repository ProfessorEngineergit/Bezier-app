/**
 * Plays reactions and picks which one a click starts. Each body part has its own deck of
 * reactions, dealt like cards so none repeats soon; each play is randomly mirrored and slightly
 * scaled and sped up or down.
 */

import { CHANNELS, type Channel, rest, type Values } from './channels.js';
import { type Drive, HOPS, REACTIONS, type ReactionName } from './reaction-data.js';

export type { ReactionName } from './reaction-data.js';

export type Zone = 'ear' | 'pencil' | 'hand' | 'eye' | 'face' | 'belly' | 'foot' | 'head';

/** Reaction decks per body part. A new deck never starts with the previous deck's last card. */
export const DECKS: Readonly<Record<Zone, readonly ReactionName[]>> = {
  ear: ['beep', 'tilt', 'giggle'],
  pencil: ['pen', 'salute', 'think'],
  hand: ['wave', 'highfive', 'clap', 'shrug'],
  eye: ['blinkhard', 'wink', 'surprise', 'shy'],
  face: ['giggle', 'shy', 'wink', 'nod', 'tilt'],
  belly: ['squish', 'giggle', 'oops', 'yawn'],
  foot: ['hop', 'stomp', 'dance'],
  head: ['nod', 'no', 'tilt', 'juhu', 'spin', 'surprise', 'think', 'cheer', 'dance'],
};

const PARTS: readonly (readonly [Zone, readonly string[]])[] = [
  ['ear', ['Ohr']],
  ['pencil', ['Stift']],
  ['hand', ['Hand', 'Unterarm', 'Oberarm', 'Schulter', 'Ellbogen', 'Finger']],
  ['eye', ['Auge', 'Fassung', 'Iris', 'Frontlinse', 'Lid', 'Unterlid']],
  ['face', ['Gesichtsglas', 'Kopfkern', 'Stirnkamera']],
  ['belly', ['Rumpf', 'Anzeigeglas', 'Statusbalken']],
  ['foot', ['Fuß', 'Schuh', 'Sohle', 'Hüfte', 'Kolben']],
];

/**
 * The body part a node belongs to. Only the node and its parent joint count: every part has the
 * body as an ancestor, so checking the whole ancestry would turn a head click into a belly click.
 */
export function zoneOf(chain: readonly string[]): Zone {
  const near = chain.slice(0, 2);
  for (const [zone, prefixes] of PARTS)
    if (near.some((name) => prefixes.some((prefix) => name.startsWith(prefix)))) return zone;
  return 'head';
}

// Mirroring: left and right swap, and turns are reversed.
const SWAPPED: ReadonlyMap<Channel, Channel> = new Map(
  CHANNELS.flatMap((name): [Channel, Channel][] => {
    const other =
      name.startsWith('armL') || name.startsWith('legL')
        ? name.replace(/^(arm|leg)L/, '$1R')
        : name.startsWith('armR') || name.startsWith('legR')
          ? name.replace(/^(arm|leg)R/, '$1L')
          : name === 'lidCloseL'
            ? 'lidCloseR'
            : name === 'lidCloseR'
              ? 'lidCloseL'
              : name;
    return [[name, other as Channel]];
  }),
);
const FLIPPED: ReadonlySet<Channel> = new Set<Channel>([
  'yaw',
  'bodyRoll',
  'bodyTwist',
  'neckTilt',
  'neckTurn',
  'lidTilt',
  'posX',
]);
/** Channels that are joint angles, which a reaction may scale. */
const SCALED: ReadonlySet<Channel> = new Set<Channel>(
  CHANNELS.filter(
    (name) =>
      /^(body|neck|arm|leg)/.test(name) &&
      name !== 'bodyZ' &&
      !name.endsWith('Ext') &&
      name !== 'lidTilt',
  ),
);

interface Compiled {
  time: number;
  drives: readonly (readonly [Channel, Drive])[];
}
const COMPILED = Object.fromEntries(
  (Object.keys(REACTIONS) as ReactionName[]).map((name) => [
    name,
    REACTIONS[name].map(
      ([time, drives]): Compiled => ({
        time,
        drives: Object.entries(drives) as [Channel, Drive][],
      }),
    ),
  ]),
) as Record<ReactionName, Compiled[]>;

/** How long a reaction stays active after its last step, so the springs can settle. */
const TAIL = 0.35;
/** Clicks within `PESTERED_WITHIN` seconds that count as too many. */
const PESTERED_AFTER = 6;
const PESTERED_WITHIN = 3;

interface Playing {
  name: ReactionName;
  since: number;
  steps: readonly Compiled[];
  mirror: boolean;
  amplitude: number;
  tempo: number;
}

export class Reactions {
  /** Current hop height in metres. */
  hop = 0;
  readonly #playing: Playing[] = [];
  readonly #clicks: number[] = [];
  readonly #random: () => number;
  readonly #decks = new Map<Zone, ReactionName[]>();
  readonly #last = new Map<Zone, ReactionName>();

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  get active(): boolean {
    return this.#playing.length > 0;
  }

  /** Plays a reaction. `varied` randomly mirrors, scales and speeds it. */
  play(name: ReactionName, now: number, varied = false): void {
    const r = this.#random;
    this.#playing.push({
      name,
      since: now,
      steps: COMPILED[name],
      mirror: varied && r() < 0.5,
      amplitude: varied ? 0.85 + r() * 0.35 : 1,
      tempo: varied ? 0.9 + r() * 0.25 : 1,
    });
  }

  /** Handles a click on `chain`: starts that part's next reaction and returns its name. */
  click(chain: readonly string[], now: number): ReactionName {
    this.#clicks.push(now);
    while (this.#clicks.length > 0 && now - (this.#clicks[0] ?? now) > PESTERED_WITHIN)
      this.#clicks.shift();
    let name: ReactionName;
    if (this.#clicks.length >= PESTERED_AFTER) {
      this.#clicks.length = 0;
      name = 'dizzy';
    } else name = this.#deal(zoneOf(chain));
    this.play(name, now, true);
    return name;
  }

  #deal(zone: Zone): ReactionName {
    let deck = this.#decks.get(zone) ?? [];
    if (deck.length === 0) {
      deck = [...DECKS[zone]];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.#random() * (i + 1));
        const a = deck[i];
        const b = deck[j];
        if (a !== undefined && b !== undefined) {
          deck[i] = b;
          deck[j] = a;
        }
      }
      // A new deck never starts with the previous deck's last card.
      if (deck.length > 1 && deck[deck.length - 1] === this.#last.get(zone))
        deck.unshift(deck.pop() ?? 'nod');
      this.#decks.set(zone, deck);
    }
    const dealt = deck.pop() ?? 'nod';
    this.#last.set(zone, dealt);
    return dealt;
  }

  /** Adds the active reactions' targets on top of the idle layer's. */
  apply(now: number, target: Values): void {
    this.hop = 0;
    for (let i = this.#playing.length - 1; i >= 0; i--) {
      const playing = this.#playing[i];
      if (playing === undefined) continue;
      const since = (now - playing.since) * playing.tempo;
      const last = playing.steps[playing.steps.length - 1];
      if (last === undefined || since > last.time + TAIL) {
        this.#playing.splice(i, 1);
        continue;
      }
      let current = playing.steps[0];
      for (const step of playing.steps) if (step.time <= since) current = step;
      if (current === undefined) continue;
      for (const [channel, drive] of current.drives) {
        let value = typeof drive === 'function' ? drive(since) : drive;
        let into = channel;
        if (playing.mirror) {
          into = SWAPPED.get(channel) ?? channel;
          if (FLIPPED.has(channel)) value = -value;
        }
        if (SCALED.has(into)) {
          const at = rest(into);
          value = at + (value - at) * playing.amplitude;
        }
        target.set(into, value);
      }
      this.hop += (HOPS[playing.name]?.(since) ?? 0) * playing.amplitude;
    }
  }
}
