/**
 * App-wide Nib controller: there is one Nib. Pages register spots where he can stand, guided
 * lessons say what to point at. Holds that state and decides placement, speech and step progress.
 * No rendering, so it is testable; `NibCompanion.tsx` puts it on screen.
 */

import { type Choice, type Guide, GuideRunner, type NibEvent, type Transition } from './guide.js';
import { type Memory, recall, remember } from './progress.js';
import type { ReactionName } from './reaction-data.js';
import { resolve, type Target } from './target.js';

/** What the controller needs from the figure; implemented by the stage, faked in tests. */
export interface Actor {
  play(name: ReactionName, now: number): void;
  /** Points at `dx`, `dy` pixels from his shoulder (`dy` up) until `until`. */
  point(dx: number, dy: number, until: number): void;
  stopPointing(): void;
  /** His screen rect, to compute target offsets from him. */
  box(): DOMRect | null;
}

export interface Option {
  label: string;
  run: () => void;
}

export interface Bubble {
  /** Changes with every new bubble, so views can tell a new one from the same one. */
  key: number;
  text: string;
  options: readonly Option[];
}

export type Placement =
  | { kind: 'spot'; element: Element; width: number; frame: 'full' | 'head' | 'whole' }
  | { kind: 'dock'; width: number };

export interface Progress {
  id: string;
  title: string;
  step: number;
  steps: number;
  /** The step took long enough to show the alternative hint. */
  hinted: boolean;
}

export interface NibSnapshot {
  bubble: Bubble | null;
  /** Pointing target, for the highlight ring. */
  aim: Target | null;
  guide: Progress | null;
  /** Guides finished (not skipped) since page load, so a view can detect a new completion. */
  finished: number;
  version: number;
}

export interface SpotOptions {
  /** He stands at the registered spot with the highest priority. */
  priority?: number;
  /** Drawn width in pixels. */
  width?: number;
  /** Full figure, or head and neck in a round window (the spot is then square). */
  frame?: 'full' | 'head' | 'whole';
}

interface Spot {
  element: Element;
  priority: number;
  width: number;
  frame: 'full' | 'head' | 'whole';
  order: number;
}

export const DEFAULT_WIDTH = 132;
export const DOCK_WIDTH = 116;
/** Page polling interval while a guide runs, in seconds. */
const POLL = 0.25;

export interface ControllerOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Seconds; used for timing button presses in bubbles. */
  clock?: () => number;
  /** Resolves a target to an element on the page. */
  find?: (target: Target) => Element | null;
}

export class NibController {
  readonly #storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly #clock: () => number;
  readonly #find: (target: Target) => Element | null;
  readonly #listeners = new Set<() => void>();
  readonly #spots = new Set<Spot>();
  readonly #docks = new Set<string>();
  #memory: Memory;
  #actor: Actor | null = null;
  #runner: GuideRunner | null = null;
  #bubble: Bubble | null = null;
  #bubbleUntil = Infinity;
  #aim: Target | null = null;
  #ring = true;
  #lastPoll = -Infinity;
  #count = 0;
  #order = 0;
  #island = false;
  #finished = 0;
  #snapshot: NibSnapshot = { bubble: null, aim: null, guide: null, finished: 0, version: 0 };

  constructor(options: ControllerOptions = {}) {
    this.#storage = options.storage ?? null;
    this.#clock = options.clock ?? (() => performance.now() / 1000);
    this.#find = options.find ?? ((target) => resolve(target));
    this.#memory = recall(this.#storage);
  }

  // ---- State for React's useSyncExternalStore.
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): NibSnapshot => this.#snapshot;

  #changed(): void {
    const runner = this.#runner;
    const progress: Progress | null =
      runner === null || runner.step === null
        ? null
        : {
            id: runner.guide.id,
            title: runner.guide.title,
            step: runner.index,
            steps: runner.guide.steps.length,
            hinted: runner.hinted,
          };
    this.#snapshot = {
      bubble: this.#bubble,
      aim: this.#ring ? this.#aim : null,
      guide: progress,
      finished: this.#finished,
      version: this.#snapshot.version + 1,
    };
    for (const listener of this.#listeners) listener();
  }

  // ---- Placement.
  /** Registers a place he can stand. Returns an unregister function. */
  registerSpot(element: Element, options: SpotOptions = {}): () => void {
    const spot: Spot = {
      element,
      priority: options.priority ?? 0,
      width: options.width ?? DEFAULT_WIDTH,
      frame: options.frame ?? 'full',
      order: this.#order++,
    };
    this.#spots.add(spot);
    return () => void this.#spots.delete(spot);
  }

  /**
   * Island mode (`island/`): when no page offers a spot he speaks from the title bar instead of
   * the corner dock. A spot still wins, so the start page keeps the figure.
   */
  setIsland(on: boolean): void {
    if (this.#island === on) return;
    this.#island = on;
    this.#changed();
  }

  get island(): boolean {
    return this.#island;
  }

  /** Keeps him docked in the corner regardless of spots, keyed by `reason`. */
  dock(reason: string, on: boolean): void {
    if (on) this.#docks.add(reason);
    else this.#docks.delete(reason);
  }

  /**
   * Where he should stand, or null when not needed: the best visible spot, else the corner dock
   * while a guide runs, he has something to say, or a dock reason is set.
   */
  placement(): Placement | null {
    let best: Spot | null = null;
    for (const spot of this.#spots) {
      if (!spot.element.isConnected) continue;
      const { width, height } = spot.element.getBoundingClientRect();
      if (width <= 0 || height <= 0) continue;
      if (
        best === null ||
        spot.priority > best.priority ||
        (spot.priority === best.priority && spot.order > best.order)
      )
        best = spot;
    }
    if (best !== null)
      return { kind: 'spot', element: best.element, width: best.width, frame: best.frame };
    if (this.#island) return null;
    if (this.#docks.size > 0 || this.#runner !== null || this.#bubble !== null)
      return { kind: 'dock', width: DOCK_WIDTH };
    return null;
  }

  // ---- Figure.
  attach(actor: Actor | null): void {
    this.#actor = actor;
  }

  /** Plays a reaction (hop, wave). No effect while he is not on screen. */
  react(name: ReactionName, now: number): void {
    this.#actor?.play(name, now);
  }

  // ---- Speech.
  /** Shows a bubble. With `seconds` it expires; otherwise it stays until dismissed. */
  say(
    text: string,
    options: { options?: readonly Option[]; seconds?: number; now?: number } = {},
  ): void {
    this.#bubble = { key: ++this.#count, text, options: options.options ?? [] };
    this.#bubbleUntil =
      options.seconds === undefined ? Infinity : (options.now ?? 0) + options.seconds;
    this.#changed();
  }

  hush(): void {
    if (this.#bubble === null) return;
    this.#bubble = null;
    this.#changed();
  }

  // ---- Memory.
  get memory(): Memory {
    return this.#memory;
  }

  /** Records that the greeting was shown. */
  markMet(): void {
    this.#remember({ ...this.#memory, met: true });
  }

  /** Whether this guide was neither finished nor skipped yet. */
  isNew(guideId: string): boolean {
    return !this.#memory.guides.includes(guideId);
  }

  #remember(memory: Memory): void {
    this.#memory = memory;
    remember(this.#storage, memory);
  }

  // ---- Guides.
  get guiding(): boolean {
    return this.#runner !== null;
  }

  startGuide(guide: Guide, now: number): void {
    this.#runner = new GuideRunner(guide, { resolve: this.#find });
    this.#apply(this.#runner.start(now), now);
  }

  stopGuide(): void {
    this.#runner = null;
    this.#aim = null;
    this.#bubble = null;
    this.#actor?.stopPointing();
    this.#changed();
  }

  /** Forwards an editor or page event to the running guide. */
  notify(event: NibEvent, now: number): void {
    const runner = this.#runner;
    if (runner === null) return;
    this.#apply(runner.notify(event, now), now);
  }

  /** Called every drawn frame: polls the page at `POLL` intervals and keeps the arm pointing. */
  tick(now: number): void {
    if (this.#bubble !== null && now >= this.#bubbleUntil) this.hush();
    const runner = this.#runner;
    if (runner === null) return;
    if (now - this.#lastPoll < POLL) return;
    this.#lastPoll = now;
    this.#apply(runner.poll(now), now);
    this.#point(now);
  }

  /** Points the arm at the current step's target while it exists. */
  #point(now: number): void {
    const aim = this.#aim;
    const actor = this.#actor;
    const box = actor?.box() ?? null;
    if (aim === null || actor === null || box === null) return;
    const element = this.#find(aim);
    if (element === null) return;
    const target = element.getBoundingClientRect();
    if (target.width <= 0 || target.height <= 0) return;
    const dx = target.left + target.width / 2 - (box.left + box.width / 2);
    const dy = box.top + box.height * 0.55 - (target.top + target.height / 2);
    actor.point(dx, dy, now + POLL * 2);
  }

  #apply(transition: Transition | null, now: number): void {
    if (transition === null) return;
    const runner = this.#runner;
    if (transition.kind === 'step') {
      const { step } = transition;
      this.#aim = step.at ?? null;
      this.#ring = step.ring !== false;
      this.#bubble = {
        key: ++this.#count,
        text: step.say,
        options: this.#optionsFor(step.choices, step.wait !== undefined),
      };
      this.#bubbleUntil = Infinity;
      this.#lastPoll = -Infinity;
      if (step.at === undefined) this.#actor?.stopPointing();
      if (step.arrive !== undefined) this.react(step.arrive, now);
      this.#changed();
      return;
    }
    if (transition.kind === 'hint') {
      if (this.#bubble !== null)
        this.#bubble = { ...this.#bubble, key: ++this.#count, text: transition.say };
      this.react('tilt', now);
      this.#changed();
      return;
    }
    const finished = runner;
    this.#runner = null;
    this.#aim = null;
    this.#bubble = null;
    this.#actor?.stopPointing();
    if (transition.kind === 'done' && finished !== null) {
      const last = finished.guide.steps[finished.guide.steps.length - 1];
      if (!transition.skipped && last?.done !== undefined) this.react(last.done, now);
      if (!transition.skipped) this.#finished += 1;
      this.#remember({
        ...this.#memory,
        guides: [...new Set([...this.#memory.guides, finished.guide.id])],
      });
    }
    this.#changed();
  }

  /** Bubble buttons: the step's choices, else Next, or Skip for a step that waits for an action. */
  #optionsFor(choices: readonly Choice[] | undefined, waits: boolean): readonly Option[] {
    if (choices !== undefined)
      return choices.map((choice) => ({ label: choice.label, run: () => this.#choose(choice.go) }));
    return waits
      ? [{ label: 'Skip this step', run: () => this.#choose('next') }]
      : [{ label: 'Next', run: () => this.#choose('next') }];
  }

  /** Handles a bubble button, timed at the press, not the step start. */
  #choose(go: Choice['go']): void {
    const runner = this.#runner;
    if (runner === null) return;
    const now = this.#clock();
    this.#apply(runner.choose(go, now), now);
  }
}
