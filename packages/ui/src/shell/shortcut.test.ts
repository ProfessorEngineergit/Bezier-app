import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesShortcut, parseShortcut, shortcutCaps, shortcutLabel } from './shortcut.js';

/** A keyboard event without a DOM. Only the fields the matcher reads. */
function press(
  key: string,
  held: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    metaKey: held.meta ?? false,
    ctrlKey: held.ctrl ?? false,
    shiftKey: held.shift ?? false,
    altKey: held.alt ?? false,
  } as KeyboardEvent;
}

describe('parseShortcut', () => {
  it('separates modifiers from the key, keeping the written order', () => {
    // Parsing preserves what was declared; imposing the platform's display order is
    // `shortcutCaps`'s job, and keeping them apart lets one declaration read naturally and draw
    // correctly.
    expect(parseShortcut('Shift+Cmd+V')).toEqual({ modifiers: ['Shift', 'Cmd'], key: 'V' });
  });

  it('reads a bare key', () => {
    expect(parseShortcut('F')).toEqual({ modifiers: [], key: 'F' });
  });

  it('is not fussy about case or spacing', () => {
    expect(parseShortcut(' cmd + u ')).toEqual({ modifiers: ['Cmd'], key: 'U' });
  });

  it('keeps a punctuation key', () => {
    expect(parseShortcut('Alt+Cmd+\\').key).toBe('\\');
  });
});

/**
 * `Cmd` is the Command key on a Mac and Control elsewhere, read from the platform (`isApple` in
 * shortcut.ts). The tests set their platform instead of inheriting the machine's.
 */
function onPlatform(platform: string) {
  vi.stubGlobal('navigator', { platform, userAgent: '' });
}

describe('shortcutCaps', () => {
  beforeEach(() => onPlatform('MacIntel'));
  afterEach(() => vi.unstubAllGlobals());

  it('renders modifiers as symbols, then the key', () => {
    expect(shortcutCaps('Cmd+F')).toEqual(['⌘', 'F']);
  });

  it('imposes the platform order rather than the written one', () => {
    // Written Shift-first because that reads naturally; drawn ⇧⌘ because that is what a Mac user
    // expects.
    expect(shortcutCaps('Shift+Cmd+V')).toEqual(['⇧', '⌘', 'V']);
    expect(shortcutCaps('Cmd+Shift+V')).toEqual(['⇧', '⌘', 'V']);
  });

  it('orders all four the way the platform does', () => {
    expect(shortcutCaps('Cmd+Shift+Alt+Ctrl+K')).toEqual(['⌃', '⌥', '⇧', '⌘', 'K']);
  });
});

describe('shortcutCaps off a Mac', () => {
  beforeEach(() => onPlatform('Linux x86_64'));
  afterEach(() => vi.unstubAllGlobals());

  it('names the keys the way a Windows or Linux keyboard does', () => {
    expect(shortcutCaps('Cmd+F')).toEqual(['Ctrl', 'F']);
    expect(shortcutCaps('Alt+Shift+K')).toEqual(['Alt', 'Shift', 'K']);
  });

  it('writes Ctrl first, whatever order the shortcut was declared in', () => {
    expect(shortcutCaps('Shift+Cmd+V')).toEqual(['Ctrl', 'Shift', 'V']);
  });

  it('draws the primary modifier once when Cmd and Ctrl are both named', () => {
    expect(shortcutCaps('Cmd+Ctrl+K')).toEqual(['Ctrl', 'K']);
  });
});

describe('shortcutLabel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is run together on a Mac and joined with plus signs elsewhere', () => {
    onPlatform('MacIntel');
    expect(shortcutLabel('Shift+Cmd+V')).toBe('⇧⌘V');
    onPlatform('Win32');
    expect(shortcutLabel('Shift+Cmd+V')).toBe('Ctrl+Shift+V');
  });
});

describe('matchesShortcut', () => {
  beforeEach(() => onPlatform('MacIntel'));
  afterEach(() => vi.unstubAllGlobals());

  it('matches a bare key', () => {
    expect(matchesShortcut('F', press('f'))).toBe(true);
    expect(matchesShortcut('F', press('g'))).toBe(false);
  });

  it('matches a command chord', () => {
    expect(matchesShortcut('Cmd+U', press('u', { meta: true }))).toBe(true);
  });

  it('refuses a chord with an extra modifier held', () => {
    // Cmd+U must not fire on Shift+Cmd+U, a different command; the failure is silent.
    expect(matchesShortcut('Cmd+U', press('u', { meta: true, shift: true }))).toBe(false);
  });

  it('refuses a chord with a modifier missing', () => {
    expect(matchesShortcut('Shift+Cmd+V', press('v', { meta: true }))).toBe(false);
    expect(matchesShortcut('Shift+Cmd+V', press('v', { meta: true, shift: true }))).toBe(true);
  });

  it('refuses a bare key when a modifier is held', () => {
    // Otherwise every Cmd chord would also trigger the plain-letter tool.
    expect(matchesShortcut('E', press('e', { meta: true }))).toBe(false);
  });

  it('has nothing to match when a shortcut names no key', () => {
    expect(matchesShortcut('Cmd', press('Meta', { meta: true }))).toBe(false);
  });
});

describe('matchesShortcut off a Mac', () => {
  beforeEach(() => onPlatform('Linux x86_64'));
  afterEach(() => vi.unstubAllGlobals());

  it('reads Cmd as Control', () => {
    expect(matchesShortcut('Cmd+U', press('u', { ctrl: true }))).toBe(true);
  });

  it('does not take the Windows or Super key for it', () => {
    expect(matchesShortcut('Cmd+U', press('u', { meta: true }))).toBe(false);
  });

  it('does not take a bare shortcut for a chord with the Super key held', () => {
    expect(matchesShortcut('E', press('e', { meta: true }))).toBe(false);
    expect(matchesShortcut('E', press('e'))).toBe(true);
  });

  it('still tells Ctrl+Z from Shift+Ctrl+Z', () => {
    expect(matchesShortcut('Shift+Cmd+Z', press('z', { ctrl: true }))).toBe(false);
    expect(matchesShortcut('Shift+Cmd+Z', press('z', { ctrl: true, shift: true }))).toBe(true);
  });
});
