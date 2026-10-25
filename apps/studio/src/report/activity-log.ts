/**
 * Recent app activity for reports: buttons and tools used, edits, workspaces, project size and
 * page memory. Control labels only, never typed text or project names and contents. In memory, a
 * fixed number of entries, oldest dropped; included only when the user enables it in the report
 * window, which shows the lines before sending.
 */

const LIMIT = 600;
const STARTED = Date.now();

interface Entry {
  at: number;
  kind: string;
  text: string;
}

const entries: Entry[] = [];
let installed = false;

/** Appends a line. Consecutive repeats are counted, not repeated. */
export function recordActivity(kind: string, text: string): void {
  const last = entries[entries.length - 1];
  const clipped = text.slice(0, 120);
  if (last !== undefined && last.kind === kind && last.text === clipped) return;
  entries.push({ at: Date.now() - STARTED, kind, text: clipped });
  if (entries.length > LIMIT) entries.shift();
}

function stamp(at: number): string {
  const seconds = Math.floor(at / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(3, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The log, oldest first, as lines. `last` keeps only the end. */
export function readActivity(last?: number): string[] {
  const kept = last === undefined ? entries : entries.slice(-last);
  return kept.map((entry) => `${stamp(entry.at)} ${entry.kind} ${entry.text}`);
}

/** For tests. */
export function forgetActivity(): void {
  entries.length = 0;
}

/** The name of a clicked control, when it has a usable one. Typed text is never read. */
export function labelOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest(
    'button, a, [role="menuitem"], [role="menuitemradio"], [role="tab"], [role="radio"], [role="switch"], [role="option"], summary, label',
  );
  if (control === null) return null;
  // Field content belongs to the user, and a label may wrap a field.
  if (control.querySelector('input[type="text"], textarea') !== null) return null;
  const label =
    control.getAttribute('aria-label') ??
    control.getAttribute('title') ??
    control.textContent?.replace(/\s+/g, ' ').trim() ??
    '';
  return label === '' ? null : label.slice(0, 60);
}

function memory(): string | null {
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return heap === undefined ? null : `${String(Math.round(heap.usedJSHeapSize / 1048576))} MB`;
}

/** Starts recording. Safe to call again. */
export function installActivityLog(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  recordActivity('app', 'started');
  document.addEventListener(
    'click',
    (event) => {
      const label = labelOf(event.target);
      if (label !== null) recordActivity('click', label);
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      // Shortcuts, not typing: a modifier held and no text field focused.
      if (!(event.metaKey || event.ctrlKey) || event.key.length !== 1) return;
      const typing = (event.target as Element | null)?.closest(
        'input, textarea, [contenteditable="true"]',
      );
      if (typing !== null && typing !== undefined) return;
      recordActivity(
        'key',
        `${event.metaKey ? '⌘' : 'Ctrl+'}${event.shiftKey ? '⇧' : ''}${event.key.toUpperCase()}`,
      );
    },
    true,
  );
  // Memory is logged when it changes by a tenth, not on a timer.
  let noted = 0;
  window.setInterval(() => {
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    if (heap === undefined || document.hidden) return;
    if (Math.abs(heap.usedJSHeapSize - noted) < noted * 0.1) return;
    noted = heap.usedJSHeapSize;
    recordActivity('memory', memory() ?? '');
  }, 15_000);
  document.addEventListener('visibilitychange', () =>
    recordActivity('window', document.hidden ? 'in the background' : 'in front'),
  );
}
