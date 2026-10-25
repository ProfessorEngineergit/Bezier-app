/**
 * State machine for the Nib island at the top of the window: hidden, compact line or open card.
 * Pure (no DOM, no clock) so it can be tested; `NibIsland.tsx` renders what `viewOf` returns.
 * Anything that needs an answer (lesson, offer, crash) folds into the compact line on an outside
 * click instead of being lost. Priority: crash, menu, lesson, tasks, strain, note.
 */

/** Nib visibility setting: off, important things only, or also small notes. */
export type NibLevel = 'off' | 'quiet' | 'friendly';

/** Facial expression; each maps to eye, lid and brow positions in `face.ts`. */
export type Mood =
  | 'rest'
  | 'sleepy'
  | 'focused'
  | 'thinking'
  | 'curious'
  | 'happy'
  | 'proud'
  | 'worried'
  | 'oops'
  /** The machine is struggling. */
  | 'strained';

export interface IslandCrash {
  title: string;
  detail: string;
}

/** Lesson text or lesson offer from the controller, keyed by bubble. */
export interface IslandSpeech {
  key: number;
  text: string;
}

export interface IslandTask {
  label: string;
  /** 0 to 1; absent when unknown. */
  progress?: number;
  /** Status text as in the title bar's work chip: phase, percent, rate, time left. */
  detail?: string;
  /** A change that only takes a moment longer than usual: no bar or card, only the strain face. */
  light?: boolean;
}

export interface IslandGuide {
  step: number;
  steps: number;
  /** The step took long enough to show the alternative hint. */
  hinted: boolean;
}

/**
 * An app notification shown by Nib instead of a toast. Sticky messages wait for an answer;
 * others fold into the line and expire.
 */
export interface IslandMessage {
  title: string;
  detail?: string;
  tone: 'info' | 'ok' | 'fail';
  sticky: boolean;
  /** Action for the card's button, by app command name ("open:<project>"). */
  action?: { label: string; deed: string };
}

/**
 * A blocking question (large model in a workspace, leaving a project while a model loads, closing
 * with work under way). Acts as a dialog; only its buttons answer it.
 */
export interface IslandQuestion {
  key: number;
  title: string;
  text: string;
  /** Left to right; the primary one is drawn filled. */
  answers: readonly { label: string; primary?: boolean }[];
}

/** Machine load: 0 fine, 1 slow, 2 struggling (measured in `strain.ts`). */
export type Strain = 0 | 1 | 2;

export type IslandInput =
  | { kind: 'level'; level: NibLevel }
  | { kind: 'crash'; crash: IslandCrash }
  | { kind: 'speech'; speech: IslandSpeech | null }
  | { kind: 'guide'; guide: IslandGuide | null }
  | { kind: 'guideDone' }
  | { kind: 'tasks'; tasks: readonly IslandTask[] }
  | { kind: 'strain'; strain: Strain }
  | { kind: 'milestone'; text: string }
  | { kind: 'message'; message: IslandMessage }
  /** A question to ask, or null once answered. */
  | { kind: 'ask'; question: IslandQuestion | null }
  /** A user action failed (e.g. a fillet): brief worried face, no text. */
  | { kind: 'wince' }
  /** Island pressed: open what the line shows, or fold the open card. */
  | { kind: 'press' }
  /** Opened from elsewhere (settings, Help menu): shows the menu. */
  | { kind: 'open' }
  /** Escape or outside press: fold into the line without answering. */
  | { kind: 'collapse' }
  /** The × or "Not now": dismiss what is shown. */
  | { kind: 'dismiss' }
  /** Something on the title bar overlaps the island (long name, narrow window, film). */
  | { kind: 'covered'; covered: boolean }
  /** The report window opened or closed. */
  | { kind: 'reporting'; open: boolean }
  /** User activity; wakes Nib. */
  | { kind: 'activity' }
  | { kind: 'tick' };

interface Timed<T> {
  value: T;
  at: number;
}

export interface IslandState {
  level: NibLevel;
  covered: boolean;
  reporting: boolean;
  crash: Timed<IslandCrash> | null;
  /** A crash whose card was folded unanswered; pressing the line reopens it. */
  unseen: Timed<IslandCrash> | null;
  /** When the last crash was shown, for the quiet period. */
  lastCrash: number;
  speech: IslandSpeech | null;
  speechOpen: boolean;
  guide: IslandGuide | null;
  tasks: readonly IslandTask[];
  /** Start of current work; short tasks never show. */
  tasksSince: number | null;
  tasksOpen: boolean;
  strain: Strain;
  strainSince: number | null;
  strainOpen: boolean;
  /** Strain is not shown again before this, after "Not now". */
  strainQuietUntil: number;
  /** Short note on the line (milestone, lesson finished). */
  note: (Timed<string> & { mood: Mood; until: number }) | null;
  lastMilestone: number;
  /** Current app message, open as a card or folded into the line. */
  message: (Timed<IslandMessage> & { open: boolean }) | null;
  /** Messages queued behind the current one; none replaces another. */
  waiting: readonly IslandMessage[];
  menu: boolean;
  /** The open question; shown above everything until answered. */
  question: IslandQuestion | null;
  /** Short-lived facial reaction. */
  reaction: { mood: Mood; until: number } | null;
  lastActivity: number;
}

/** Minimum time between two shown crashes. */
export const QUIET_FOR = 5 * 60;
/** How long the crash card stays open before folding into the line. */
export const CRASH_SHOWN = 30;
/** How long a folded crash stays on the line. */
export const UNSEEN_FOR = 10 * 60;
export const NOTE_SHOWN = 3.5;
/** How long a non-sticky message stays open, then on the line. */
export const MESSAGE_SHOWN = 5;
export const MESSAGE_KEPT = 8;
/** Queue limit; the oldest are dropped first. */
const MESSAGES_WAITING = 5;
/** Minimum gap between milestones; one inside it is dropped. */
export const MILESTONE_GAP = 10 * 60;
export const REACTION_FOR = 1.2;
export const WINCE_FOR = 2.4;
/** Idle time before Nib dozes off. */
export const SLEEP_AFTER = 8 * 60;
/** Work shorter than this never shows, so quick rebuilds don't flash the line. */
export const TASK_SHOWN_AFTER = 1.5;
/** Strain must last this long before it shows, so a brief spike is ignored. */
export const STRAIN_SHOWN_AFTER = 6;
/** Quiet period for strain after "Not now". */
export const STRAIN_QUIET_FOR = 20 * 60;

export function initialIsland(level: NibLevel, now: number): IslandState {
  return {
    level,
    covered: false,
    reporting: false,
    crash: null,
    unseen: null,
    lastCrash: -Infinity,
    speech: null,
    speechOpen: false,
    guide: null,
    tasks: [],
    tasksSince: null,
    tasksOpen: false,
    strain: 0,
    strainSince: null,
    strainOpen: false,
    strainQuietUntil: -Infinity,
    note: null,
    lastMilestone: -Infinity,
    message: null,
    waiting: [],
    menu: false,
    question: null,
    reaction: null,
    lastActivity: now,
  };
}

/** Applies an input. Returns the same object when nothing changes. */
export function step(state: IslandState, input: IslandInput, now: number): IslandState {
  const next = apply(state, input, now);
  return expire(next, now);
}

/** Closes every card; the line is then derived from what remains. */
const closed = (state: IslandState): IslandState => ({
  ...state,
  menu: false,
  speechOpen: false,
  tasksOpen: false,
  strainOpen: false,
});

function apply(state: IslandState, input: IslandInput, now: number): IslandState {
  // A question waits for an answer: press, Escape and × do not remove it.
  if (
    state.question !== null &&
    (input.kind === 'press' ||
      input.kind === 'collapse' ||
      input.kind === 'dismiss' ||
      input.kind === 'open')
  )
    return state;
  switch (input.kind) {
    case 'level':
      if (input.level === state.level) return state;
      // Turning off clears everything; turning on starts clean.
      return input.level === 'off'
        ? { ...initialIsland('off', now), lastCrash: state.lastCrash }
        : {
            ...state,
            level: input.level,
            note: input.level === 'quiet' ? null : state.note,
            reaction: null,
          };
    case 'crash':
      if (state.level === 'off' || now - state.lastCrash < QUIET_FOR) return state;
      // With the report window open the user is already reporting.
      if (state.reporting) return state;
      return {
        ...closed(state),
        crash: { value: input.crash, at: now },
        unseen: null,
        lastCrash: now,
        note: null,
      };
    case 'speech': {
      const speech = input.speech;
      if (speech === null) {
        return state.speech === null ? state : { ...state, speech: null, speechOpen: false };
      }
      if (state.speech !== null && state.speech.key === speech.key) return state;
      // New speech opens the card over tasks; under a crash it waits on the line.
      return { ...closed(state), speech, speechOpen: true, lastActivity: now };
    }
    case 'guide':
      if (sameGuide(state.guide, input.guide)) return state;
      return { ...state, guide: input.guide };
    case 'guideDone':
      if (state.level === 'off') return state;
      return {
        ...state,
        guide: null,
        note: { value: 'Done. Nicely made.', at: now, mood: 'happy', until: now + NOTE_SHOWN },
      };
    case 'tasks': {
      if (sameTasks(state.tasks, input.tasks)) return state;
      const busy = input.tasks.length > 0;
      return {
        ...state,
        tasks: input.tasks,
        tasksSince: busy ? (state.tasksSince ?? now) : null,
        tasksOpen: busy && state.tasksOpen,
      };
    }
    case 'strain':
      if (input.strain === state.strain) return state;
      return {
        ...state,
        strain: input.strain,
        strainSince: input.strain === 0 ? null : (state.strainSince ?? now),
        strainOpen: input.strain !== 0 && state.strainOpen,
      };
    case 'milestone':
      if (state.level !== 'friendly') return state;
      if (now - state.lastMilestone < MILESTONE_GAP) return state;
      // Only on a free line, never over a lesson or crash.
      if (state.crash !== null || state.menu || state.speech !== null) return state;
      return {
        ...state,
        lastMilestone: now,
        note: { value: input.text, at: now, mood: 'proud', until: now + NOTE_SHOWN },
      };
    case 'message': {
      // A failure jumps ahead of other messages; the current one goes to the head of the queue.
      if (
        state.message !== null &&
        input.message.tone === 'fail' &&
        state.message.value.tone !== 'fail'
      )
        return {
          ...state,
          message: { value: input.message, at: now, open: true },
          waiting: [state.message.value, ...state.waiting].slice(0, MESSAGES_WAITING),
        };
      if (state.message !== null)
        return { ...state, waiting: [...state.waiting, input.message].slice(-MESSAGES_WAITING) };
      // Over an open card (crash, menu, lesson) it waits on the line.
      const busy = state.crash !== null || cardOf(state) !== null;
      return { ...state, message: { value: input.message, at: now, open: !busy } };
    }
    case 'ask':
      if (input.question?.key === state.question?.key) return state;
      return { ...state, question: input.question, lastActivity: now };
    case 'wince':
      // Friendly level only, and never over a crash. The failure has its own message.
      if (state.level !== 'friendly' || state.crash !== null) return state;
      return { ...state, reaction: { mood: 'worried', until: now + WINCE_FOR } };
    case 'press':
      return press(state, now);
    case 'open':
      if (state.level === 'off') return state;
      return {
        ...closed(state),
        crash: null,
        unseen: state.crash ?? state.unseen,
        menu: true,
        note: null,
        lastActivity: now,
      };
    case 'collapse':
      if (state.crash !== null) return { ...state, crash: null, unseen: state.crash };
      if (state.message?.open === true)
        return { ...state, message: { ...state.message, open: false, at: now } };
      return cardOf(state) === null ? state : closed(state);
    case 'dismiss':
      if (state.crash !== null) return { ...state, crash: null, unseen: null };
      if (state.message?.open === true) return following(state, now);
      if (state.menu || state.tasksOpen) return closed(state);
      if (state.speechOpen || (state.speech !== null && state.guide === null))
        return { ...closed(state), speech: null };
      if (state.strainOpen) return { ...closed(state), strainQuietUntil: now + STRAIN_QUIET_FOR };
      if (state.unseen !== null) return { ...state, unseen: null };
      if (state.message !== null) return following(state, now);
      if (state.note !== null) return { ...state, note: null };
      return state;
    case 'covered':
      return input.covered === state.covered ? state : { ...state, covered: input.covered };
    case 'reporting':
      if (input.open === state.reporting) return state;
      // The report window replaces the crash card.
      return input.open
        ? { ...closed(state), reporting: true, crash: null, unseen: null }
        : { ...state, reporting: false };
    case 'activity':
      return now - state.lastActivity < 1 ? state : { ...state, lastActivity: now };
    case 'tick':
      return state;
  }
}

/** Dismisses the current message and opens the next queued one. */
function following(state: IslandState, now: number): IslandState {
  const [next, ...rest] = state.waiting;
  return {
    ...state,
    message: next === undefined ? null : { value: next, at: now, open: true },
    waiting: rest,
  };
}

/** Opens what the line shows, or folds the open card. */
function press(state: IslandState, now: number): IslandState {
  const woken = { ...state, lastActivity: now };
  if (state.crash !== null || cardOf(state) !== null)
    return apply(woken, { kind: 'collapse' }, now);
  switch (lineOf(state, now)?.kind) {
    case 'crash':
      if (state.unseen === null) return woken;
      // Reopened, it stays open for the full CRASH_SHOWN again.
      return { ...woken, crash: { value: state.unseen.value, at: now }, unseen: null };
    case 'lesson':
    case 'offer':
      return { ...woken, speechOpen: true };
    case 'task':
      return { ...woken, tasksOpen: true };
    case 'effort':
      return woken;
    case 'message':
      return state.message === null
        ? woken
        : { ...woken, message: { ...state.message, open: true, at: now } };
    case 'strain':
      return { ...woken, strainOpen: true };
    default:
      return {
        ...woken,
        menu: true,
        note: null,
        reaction: state.level === 'friendly' ? { mood: 'happy', until: now + REACTION_FOR } : null,
      };
  }
}

function expire(state: IslandState, now: number): IslandState {
  let next = state;
  if (next.crash !== null && now - next.crash.at >= CRASH_SHOWN)
    next = { ...next, crash: null, unseen: next.crash };
  if (next.unseen !== null && now - next.unseen.at >= UNSEEN_FOR) next = { ...next, unseen: null };
  if (next.note !== null && now >= next.note.until) next = { ...next, note: null };
  const message = next.message;
  if (message !== null && !message.value.sticky) {
    // Once read, a queued message replaces it instead of it lingering on the line.
    if (message.open && now - message.at >= MESSAGE_SHOWN)
      next =
        next.waiting.length > 0
          ? following(next, now)
          : { ...next, message: { ...message, open: false, at: now } };
    else if (!message.open && now - message.at >= MESSAGE_KEPT) next = following(next, now);
  }
  if (next.reaction !== null && now >= next.reaction.until) next = { ...next, reaction: null };
  return next;
}

const sameGuide = (a: IslandGuide | null, b: IslandGuide | null): boolean =>
  a === b ||
  (a !== null && b !== null && a.step === b.step && a.steps === b.steps && a.hinted === b.hinted);

const sameTasks = (a: readonly IslandTask[], b: readonly IslandTask[]): boolean =>
  a.length === b.length &&
  a.every(
    (task, i) =>
      task.label === b[i]?.label &&
      task.progress === b[i]?.progress &&
      task.detail === b[i]?.detail &&
      task.light === b[i]?.light,
  );

// ---- View

export type IslandContent =
  | { kind: 'crash'; crash: IslandCrash }
  | { kind: 'menu' }
  | { kind: 'speech'; speech: IslandSpeech; guide: IslandGuide | null }
  | { kind: 'tasks'; tasks: readonly IslandTask[] }
  | { kind: 'strain'; strain: Strain }
  | { kind: 'message'; message: IslandMessage; more: number }
  | { kind: 'question'; question: IslandQuestion };

/** What the compact line shows; the text comes from the app (`island-card.ts`). */
export type IslandLine =
  | { kind: 'crash' }
  | { kind: 'lesson'; step: number; steps: number; text: string }
  | { kind: 'offer' }
  | { kind: 'task'; label: string; count: number }
  /** Only light work under way: strain face, no text. */
  | { kind: 'effort' }
  | { kind: 'strain'; strain: Strain }
  | { kind: 'message'; text: string; tone: IslandMessage['tone'] }
  | { kind: 'note'; text: string };

export interface IslandView {
  shape: 'hidden' | 'compact' | 'card';
  /** Card content; null on the line and when hidden. */
  content: IslandContent | null;
  /** Line content; kept while the card is open so it can fold back into it. */
  line: IslandLine | null;
  mood: Mood;
  /** Progress under the line: 0 to 1, null when unknown, absent when nothing is under way. */
  progress?: number | null;
}

/** The open card, if any. */
function cardOf(state: IslandState): IslandContent | null {
  if (state.question !== null) return { kind: 'question', question: state.question };
  if (state.crash !== null) return { kind: 'crash', crash: state.crash.value };
  if (state.menu) return { kind: 'menu' };
  if (state.speech !== null && state.speechOpen)
    return { kind: 'speech', speech: state.speech, guide: state.guide };
  if (state.message?.open === true)
    return { kind: 'message', message: state.message.value, more: state.waiting.length };
  if (state.tasksOpen && state.tasks.some((task) => task.light !== true))
    return { kind: 'tasks', tasks: state.tasks.filter((task) => task.light !== true) };
  if (state.strainOpen && state.strain > 0) return { kind: 'strain', strain: state.strain };
  return null;
}

/** What the line shows, by priority. */
function lineOf(state: IslandState, now: number): IslandLine | null {
  if (state.unseen !== null) return { kind: 'crash' };
  if (state.speech !== null) {
    return state.guide !== null
      ? {
          kind: 'lesson',
          step: state.guide.step,
          steps: state.guide.steps,
          text: state.speech.text,
        }
      : { kind: 'offer' };
  }
  if (state.message !== null)
    return { kind: 'message', text: state.message.value.title, tone: state.message.value.tone };
  if (state.tasksSince !== null && now - state.tasksSince >= TASK_SHOWN_AFTER) {
    const real = state.tasks.filter((task) => task.light !== true);
    const task = real[0];
    if (task !== undefined) return { kind: 'task', label: task.label, count: real.length };
    if (state.tasks.length > 0) return { kind: 'effort' };
  }
  if (
    state.strain > 0 &&
    state.strainSince !== null &&
    now - state.strainSince >= STRAIN_SHOWN_AFTER &&
    now >= state.strainQuietUntil
  )
    return { kind: 'strain', strain: state.strain };
  if (state.note !== null) return { kind: 'note', text: state.note.value };
  return null;
}

export function viewOf(state: IslandState, now: number): IslandView {
  if (state.level === 'off') return { shape: 'hidden', content: null, line: null, mood: 'rest' };
  const content = cardOf(state);
  const line = lineOf(state, now);
  const progress = progressOf(state, line);
  const mood = moodOf(state, now, content, line);
  const shown = (shape: IslandView['shape']): IslandView =>
    progress === undefined
      ? { shape, content, line, mood }
      : { shape, content, line, mood, progress };
  // A question shows even when the bar is covered or the report window is open.
  if (content?.kind === 'question') return shown('card');
  if (content !== null && (!state.reporting || content.kind === 'crash')) return shown('card');
  if (state.reporting) return { shape: 'hidden', content: null, line, mood };
  if (line === null) return { shape: 'hidden', content: null, line: null, mood };
  // Hide when something covers the island, unless a crash is waiting.
  if (state.covered && line.kind !== 'crash') return { shape: 'hidden', content: null, line, mood };
  return shown('compact');
}

function progressOf(state: IslandState, line: IslandLine | null): number | null | undefined {
  if (line?.kind === 'lesson') return line.steps > 0 ? line.step / line.steps : null;
  if (line?.kind !== 'task') return undefined;
  // With several tasks show the slowest. One unknown progress makes the whole line unknown.
  let value = 1;
  for (const task of state.tasks) {
    if (task.light === true) continue;
    if (task.progress === undefined) return null;
    value = Math.min(value, Math.max(0, Math.min(1, task.progress)));
  }
  return value;
}

function moodOf(
  state: IslandState,
  now: number,
  content: IslandContent | null,
  line: IslandLine | null,
): Mood {
  if (content?.kind === 'crash') return 'oops';
  if (content?.kind === 'question') return 'thinking';
  if (state.reaction !== null) return state.reaction.mood;
  const said =
    content?.kind === 'message'
      ? content.message.tone
      : line?.kind === 'message'
        ? line.tone
        : null;
  if (said !== null) return said === 'fail' ? 'worried' : said === 'ok' ? 'happy' : 'curious';
  if (line?.kind === 'crash') return 'worried';
  if (content?.kind === 'strain' || line?.kind === 'strain' || line?.kind === 'effort')
    return 'strained';
  if (content?.kind === 'speech' || line?.kind === 'lesson' || line?.kind === 'offer')
    return state.guide?.hinted === true ? 'thinking' : 'curious';
  if (content?.kind === 'tasks' || line?.kind === 'task') return 'focused';
  if (state.note !== null) return state.note.mood;
  if (content?.kind === 'menu') return 'curious';
  if (state.level === 'friendly' && now - state.lastActivity >= SLEEP_AFTER) return 'sleepy';
  return 'rest';
}

/** Time of the next self-triggered change, so the host can schedule a wake instead of polling. */
export function nextChange(state: IslandState, now: number): number {
  const times = [
    state.crash === null ? Infinity : state.crash.at + CRASH_SHOWN,
    state.unseen === null ? Infinity : state.unseen.at + UNSEEN_FOR,
    state.note?.until ?? Infinity,
    state.message === null || state.message.value.sticky
      ? Infinity
      : state.message.at + (state.message.open ? MESSAGE_SHOWN : MESSAGE_KEPT),
    state.reaction?.until ?? Infinity,
    state.tasksSince === null ? Infinity : state.tasksSince + TASK_SHOWN_AFTER,
    state.strainSince === null ? Infinity : state.strainSince + STRAIN_SHOWN_AFTER,
    state.strainQuietUntil,
    state.level === 'friendly' ? state.lastActivity + SLEEP_AFTER : Infinity,
  ];
  return Math.min(...times.filter((at) => at > now));
}
