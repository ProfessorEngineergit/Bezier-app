/**
 * Guided lessons: steps in which Nib says something, points at something and waits for the user.
 * Decides when a step is done, with no DOM or clock of its own, so it is testable: the controller
 * forwards events (edits, clicks) and polls whether awaited elements have appeared. Every step can
 * be skipped.
 */

import type { ReactionName } from './reaction-data.js';
import type { Target } from './target.js';

/** What completes a step. Without one the step completes on Next. */
export type Wait =
  /** A change to the model: `op` is the journal's operation, `type` the feature it adds. */
  | { edit: { op?: string; type?: string | readonly string[] } }
  | { click: Target }
  /** An element appeared on the page. */
  | { present: Target }
  /** An element disappeared from the page. */
  | { gone: Target }
  /** A number of seconds passed. */
  | { delay: number };

export interface Choice {
  label: string;
  /** `next` and `skip` advance the guide; `close` ends it silently. */
  go: 'next' | 'skip' | 'close';
}

export interface GuideStep {
  /** What Nib says: plain and short. */
  say: string;
  /** What he points at during the step. */
  at?: Target;
  /** Draws a ring around the target. Off for large targets like the viewport. */
  ring?: boolean;
  wait?: Wait;
  /** Alternative text shown once the step has taken this many seconds. */
  hint?: { after: number; say: string };
  /** Reactions played when the step begins and when it is done. */
  arrive?: ReactionName;
  done?: ReactionName;
  /** Bubble buttons replacing the default Next. */
  choices?: readonly Choice[];
}

export interface Guide {
  id: string;
  title: string;
  steps: readonly GuideStep[];
}

export type NibEvent =
  | { kind: 'edit'; op: string; type?: string }
  | { kind: 'click'; target: EventTarget | null };

/** The page queries a guide needs. */
export interface GuideEnv {
  resolve(target: Target): Element | null;
}

export type Transition =
  | { kind: 'step'; index: number; step: GuideStep }
  | { kind: 'hint'; say: string }
  | { kind: 'done'; skipped: boolean }
  | { kind: 'closed' };

/**
 * Detects a DOM node by shape instead of `instanceof`, which is unavailable in tests without a DOM.
 */
const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && 'nodeType' in value;

const asList = (value: string | readonly string[] | undefined): readonly string[] | undefined =>
  value === undefined ? undefined : typeof value === 'string' ? [value] : value;

export class GuideRunner {
  readonly guide: Guide;
  readonly #env: GuideEnv;
  #index = -1;
  #since = 0;
  #hinted = false;

  constructor(guide: Guide, env: GuideEnv) {
    this.guide = guide;
    this.#env = env;
  }

  get index(): number {
    return this.#index;
  }

  get step(): GuideStep | null {
    return this.guide.steps[this.#index] ?? null;
  }

  /** The step has run long enough to show its hint. */
  get hinted(): boolean {
    return this.#hinted;
  }

  /** Starts at the first step. */
  start(now: number): Transition {
    return this.#enter(0, now);
  }

  /** A bubble button was pressed. */
  choose(go: Choice['go'], now: number): Transition {
    if (go === 'close') return { kind: 'closed' };
    if (go === 'skip') return { kind: 'done', skipped: true };
    return this.#enter(this.#index + 1, now);
  }

  /** Advances to the next step manually. */
  next(now: number): Transition {
    return this.#enter(this.#index + 1, now);
  }

  /** Handles an editor or page event. Returns the resulting transition, if any. */
  notify(event: NibEvent, now: number): Transition | null {
    const wait = this.step?.wait;
    if (wait === undefined) return null;
    if (event.kind === 'edit' && 'edit' in wait) {
      if (wait.edit.op !== undefined && wait.edit.op !== event.op) return null;
      const types = asList(wait.edit.type);
      if (types !== undefined && (event.type === undefined || !types.includes(event.type)))
        return null;
      return this.next(now);
    }
    if (event.kind === 'click' && 'click' in wait) {
      const element = this.#env.resolve(wait.click);
      const hit = event.target;
      if (element !== null && isNode(hit) && element.contains(hit)) return this.next(now);
    }
    return null;
  }

  /** Polled periodically: checks whether the awaited element appeared and whether to hint. */
  poll(now: number): Transition | null {
    const step = this.step;
    if (step === null) return null;
    const wait = step.wait;
    if (wait !== undefined) {
      if ('present' in wait && this.#env.resolve(wait.present) !== null) return this.next(now);
      if ('gone' in wait && this.#env.resolve(wait.gone) === null) return this.next(now);
      if ('delay' in wait && now - this.#since >= wait.delay) return this.next(now);
    }
    if (step.hint !== undefined && !this.#hinted && now - this.#since >= step.hint.after) {
      this.#hinted = true;
      return { kind: 'hint', say: step.hint.say };
    }
    return null;
  }

  #enter(index: number, now: number): Transition {
    const step = this.guide.steps[index];
    if (step === undefined) {
      this.#index = this.guide.steps.length;
      return { kind: 'done', skipped: false };
    }
    this.#index = index;
    this.#since = now;
    this.#hinted = false;
    return { kind: 'step', index, step };
  }
}
