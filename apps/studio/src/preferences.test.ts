import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs, readPrefs, serializePrefs } from './preferences.js';

describe('preferences storage', () => {
  it('keeps valid values while replacing damaged fields', () => {
    expect(
      parsePrefs({ values: { theme: 'dark', quality: 'ultra', showLabels: false } }),
    ).toMatchObject({ theme: 'dark', quality: 'medium', showLabels: false });
  });

  it('reads the pre-envelope format used by early builds', () => {
    expect(parsePrefs({ theme: 'light', navigation: { invertZoom: true } })).toMatchObject({
      theme: 'light',
      navigation: { preset: 'native', invertZoom: true },
    });
  });

  it('carries the old middle-button scheme over as overridden drags', () => {
    const prefs = parsePrefs({ navigation: { scheme: 'middle-orbit' } });
    expect(prefs.navigation.preset).toBe('native');
    expect(prefs.navigation.drags.orbit).toEqual({ action: 'orbit', button: 1 });
    expect(prefs.navigation.drags.pan).toEqual({ action: 'pan', button: 2 });
  });

  it('keeps known key overrides and drops unknown ones', () => {
    const prefs = parsePrefs({
      keymap: { preset: 'blender', overrides: { extrude: 'Shift+E', nonsense: 'Q' } },
    });
    expect(prefs.keymap).toEqual({ preset: 'blender', overrides: { extrude: 'Shift+E' } });
  });

  it('falls back when storage is unavailable or corrupt', () => {
    expect(readPrefs({ getItem: () => '{' })).toEqual(DEFAULT_PREFS);
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
  });

  it('has Nib quiet unless told otherwise, and ignores a damaged value', () => {
    expect(DEFAULT_PREFS.nib).toBe('quiet');
    expect(parsePrefs({ values: { nib: 'friendly' } }).nib).toBe('friendly');
    expect(parsePrefs({ values: { nib: 'loud' } }).nib).toBe('quiet');
    expect(parsePrefs({}).nib).toBe('quiet');
    // The setting it replaces: off stays off.
    expect(parsePrefs({ values: { showNib: false } }).nib).toBe('off');
    expect(parsePrefs({ values: { showNib: true } }).nib).toBe('quiet');
    expect(parsePrefs({ values: { showNib: false, nib: 'quiet' } }).nib).toBe('quiet');
  });

  it('round trips the current schema', () => {
    expect(parsePrefs(JSON.parse(serializePrefs(DEFAULT_PREFS)))).toEqual(DEFAULT_PREFS);
  });
});

describe('selection colour', () => {
  it('keeps a colour of the #rrggbb form and falls back on anything else', () => {
    expect(parsePrefs({ selectionColour: '#FF375F' }).selectionColour).toBe('#ff375f');
    expect(parsePrefs({ selectionColour: 'red' }).selectionColour).toBe('#22b8e6');
    expect(parsePrefs({ selectionColour: 12 }).selectionColour).toBe('#22b8e6');
  });
});

describe('glass', () => {
  it('starts at Automatic, and keeps an old Reduced or Solid but not the old default Full', () => {
    expect(DEFAULT_PREFS.glass).toBe('auto');
    expect(parsePrefs({ glassMode: 'full' }).glass).toBe('auto');
    expect(parsePrefs({ glassMode: 'solid' }).glass).toBe('solid');
    expect(parsePrefs({ glass: 'full' }).glass).toBe('full');
  });
});
