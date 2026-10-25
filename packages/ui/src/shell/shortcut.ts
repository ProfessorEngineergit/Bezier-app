/**
 * Keyboard shortcut parsing, display (text and keycaps) and event matching, shared by the rail,
 * command search and key handler. Pure, so it is tested in Node.
 */

/** A declared shortcut: `'Shift+Cmd+V'`, `'F'`, `'Cmd+U'`. */
export type Shortcut = string;

export type Modifier = 'Cmd' | 'Ctrl' | 'Alt' | 'Shift';

export interface ParsedShortcut {
  modifiers: readonly Modifier[];
  /** The non-modifier key, upper-cased: `'V'`, `'F'`, `'\\'`. */
  key: string;
}

const MODIFIERS: readonly Modifier[] = ['Cmd', 'Ctrl', 'Alt', 'Shift'];

/** Apple's fixed modifier order (⌃⌥⇧⌘), independent of the declared order. */
const DISPLAY_ORDER: readonly Modifier[] = ['Ctrl', 'Alt', 'Shift', 'Cmd'];

const SYMBOL: Record<Modifier, string> = {
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Cmd: '⌘',
};

/** Windows/Linux order: Ctrl first ("Ctrl+Shift+V"). */
const NAMED_ORDER: readonly Modifier[] = ['Cmd', 'Ctrl', 'Alt', 'Shift'];

const NAME: Record<Modifier, string> = {
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Cmd: 'Ctrl',
};

export function parseShortcut(shortcut: Shortcut): ParsedShortcut {
  const parts = shortcut.split('+').map((part) => part.trim());
  const modifiers: Modifier[] = [];
  let key = '';

  for (const part of parts) {
    const modifier = MODIFIERS.find((m) => m.toLowerCase() === part.toLowerCase());
    if (modifier === undefined) key = part.toUpperCase();
    else if (!modifiers.includes(modifier)) modifiers.push(modifier);
  }

  return { modifiers, key };
}

/**
 * The keycaps to draw, in order: modifiers then key. On a Mac modifiers are symbols (⌃⌥⇧⌘);
 * elsewhere they are named, with Cmd (the primary modifier) shown as Ctrl.
 */
export function shortcutCaps(shortcut: Shortcut): readonly string[] {
  const { modifiers, key } = parseShortcut(shortcut);
  const mac = isApple();
  const caps = (mac ? DISPLAY_ORDER : NAMED_ORDER)
    .filter((m) => modifiers.includes(m))
    .map((m) => (mac ? SYMBOL[m] : NAME[m]));
  // Off a Mac, Cmd and Ctrl are the same key; show it once.
  const distinct = caps.filter((cap, index) => caps.indexOf(cap) === index);
  return key === '' ? distinct : [...distinct, key];
}

/** A shortcut as one string for a tooltip: "⇧⌘V" on a Mac, "Ctrl+Shift+V" elsewhere. */
export function shortcutLabel(shortcut: Shortcut): string {
  return shortcutCaps(shortcut).join(isApple() ? '' : '+');
}

/**
 * Whether the event matches the shortcut. Every modifier must match exactly, so `Cmd+U` does not
 * fire on `Shift+Cmd+U`.
 */
export function matchesShortcut(shortcut: Shortcut, event: KeyboardEvent): boolean {
  const { modifiers, key } = parseShortcut(shortcut);
  if (key === '') return false;

  // Cmd on a Mac, Ctrl elsewhere. `metaKey` is Command on macOS but the Windows key elsewhere.
  const wantsCmd = modifiers.includes('Cmd');
  const primary = isApple() ? event.metaKey : event.ctrlKey;

  if (wantsCmd !== primary) return false;
  // Off a Mac no shortcut uses Super/Windows, so a chord with it held belongs to the desktop and
  // must not match the bare key (e.g. Super+E must not extrude).
  if (!isApple() && event.metaKey) return false;
  if (modifiers.includes('Shift') !== event.shiftKey) return false;
  if (modifiers.includes('Alt') !== event.altKey) return false;
  if (!wantsCmd && modifiers.includes('Ctrl') !== event.ctrlKey) return false;

  return keyOf(event) === key || codeOf(event) === key;
}

/** The key from the typed character; space is spelled out. */
function keyOf(event: KeyboardEvent): string {
  return event.key === ' ' ? 'SPACE' : event.key.toUpperCase();
}

/**
 * The key from its physical position. Needed for Alt: on a Mac Alt+A types "å", but the code is
 * still KeyA.
 */
function codeOf(event: KeyboardEvent): string {
  const code = event.code ?? '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad') && /^\d$/.test(code.slice(6))) return code.slice(6);
  return code.toUpperCase();
}

/** Whether the primary modifier is Command. Not cached, so tests can switch platforms. */
export function isApple(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}
