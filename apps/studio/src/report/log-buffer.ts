/**
 * Recent console errors and warnings and uncaught window errors, kept for reports. A fixed number
 * of lines, oldest dropped, each truncated, so it stays bounded.
 */

const LINES = 80;
const WIDTH = 400;

const lines: string[] = [];
let installed = false;

/** The last unrecoverable failure, and its listeners. */
export interface Crash {
  /** The kind of failure, short enough to be a title. */
  title: string;
  /** What the browser said, to start the report with. */
  detail: string;
}
const listeners = new Set<(crash: Crash) => void>();

/** Subscribes to app failures (an uncaught error, a part that stopped), not warnings. */
export function onCrash(listener: (crash: Crash) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function crashed(title: string, detail: string): void {
  // Browsers log this when a frame is late; it is harmless.
  if (/ResizeObserver loop/.test(detail)) return;
  for (const listener of listeners) listener({ title, detail: detail.slice(0, WIDTH) });
}

function say(kind: string, parts: readonly unknown[]): void {
  const text = parts
    .map((part) => {
      if (part instanceof Error) return `${part.name}: ${part.message}`;
      if (typeof part === 'string') return part;
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    })
    .join(' ');
  lines.push(`${new Date().toISOString().slice(11, 19)} ${kind} ${text.slice(0, WIDTH)}`);
  if (lines.length > LINES) lines.shift();
}

/** Starts recording. Safe to call again. */
export function installLogBuffer(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const kind of ['error', 'warn'] as const) {
    const original = console[kind].bind(console);
    console[kind] = (...args: unknown[]) => {
      say(kind, args);
      // `Isolated` says a whole part of the app stopped; that is a crash, other errors are not.
      if (kind === 'error' && typeof args[0] === 'string' && / stopped working:$/.test(args[0]))
        crashed(args[0].replace(/:$/, ''), args.slice(1).map(String).join(' '));
      original(...args);
    };
  }
  window.addEventListener('error', (event) => {
    say('uncaught', [event.message]);
    crashed('The app hit an error', event.message);
  });
  window.addEventListener('unhandledrejection', (event) => say('rejected', [event.reason]));
}

/** The kept lines, oldest first. */
export function readLog(): string {
  return lines.join('\n');
}

/** For tests. */
export function forgetLog(): void {
  lines.length = 0;
}

export function sayToLog(kind: string, ...parts: unknown[]): void {
  say(kind, parts);
}
