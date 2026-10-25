import { describe, expect, it } from 'vitest';
import { KEY_ACTIONS, KEYMAP_PRESETS, keyConflicts, resolveKeymap } from './keymap.js';
import { matchesShortcut } from './shortcut.js';

const key = (init: Partial<KeyboardEvent> & { key: string }) =>
  ({
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    code: '',
    ...init,
  }) as KeyboardEvent;

describe('the Native keymap', () => {
  const keymap = resolveKeymap('native', {});
  it('uses the documented tool, constraint and view keys', () => {
    expect(keymap.get('extrude')).toBe('E');
    expect(keymap.get('fillet')).toBe('F');
    expect(keymap.get('move-rotate')).toBe('M');
    expect(keymap.get('constrain-parallel')).toBe('Shift+A');
    expect(keymap.get('constrain-aligned')).toBe('Shift+V');
    expect(keymap.get('union')).toBe('Cmd+U');
    expect(keymap.get('view-top')).toBe('Cmd+4');
    expect(keymap.get('view-square')).toBe('Space');
    expect(keymap.get('filter-cycle')).toBe('Tab');
  });
  it('gives no two actions the same key', () => {
    expect(keyConflicts(keymap).size).toBe(0);
  });
});

describe('the other presets', () => {
  it('are at least ten, and have no clashing keys either', () => {
    expect(KEYMAP_PRESETS.length).toBeGreaterThanOrEqual(10);
    for (const preset of KEYMAP_PRESETS) {
      expect([preset.id, [...keyConflicts(resolveKeymap(preset.id, {}))]]).toEqual([preset.id, []]);
    }
  });
  it('bind the named tools the way those tools do', () => {
    expect(resolveKeymap('freecad', {}).get('constrain-coincident')).toBe('C');
    expect(resolveKeymap('freecad', {}).get('view-front')).toBe('1');
    expect(resolveKeymap('solidworks', {}).get('zoom-fit')).toBe('F');
    expect(resolveKeymap('solidworks', {}).get('fillet')).toBeUndefined();
    expect(resolveKeymap('onshape', {}).get('extrude')).toBe('Shift+E');
    expect(resolveKeymap('sketchup', {}).get('extrude')).toBe('P');
    expect(resolveKeymap('nx', {}).get('extrude')).toBe('X');
  });
  it('give Blender its own verbs', () => {
    const blender = resolveKeymap('blender', {});
    expect(blender.get('move-rotate')).toBe('G');
    expect(blender.get('delete')).toBe('X');
    expect(blender.get('duplicate')).toBe('Shift+D');
  });
});

describe('changing one key', () => {
  it('replaces that key and can take it away', () => {
    const keymap = resolveKeymap('native', { extrude: 'Shift+E', fillet: '' });
    expect(keymap.get('extrude')).toBe('Shift+E');
    expect(keymap.has('fillet')).toBe(false);
  });
  it('knows every action it is given', () => {
    const ids = new Set(KEY_ACTIONS.map((action) => action.id));
    for (const id of resolveKeymap('native', {}).keys()) expect(ids.has(id)).toBe(true);
  });
});

describe('matching a key press', () => {
  it('matches Space by name', () => {
    expect(matchesShortcut('Space', key({ key: ' ', code: 'Space' }))).toBe(true);
  });
  it('matches Alt combinations by the physical key', () => {
    // On a Mac, Alt+A types "å".
    expect(matchesShortcut('Alt+A', key({ key: 'å', code: 'KeyA', altKey: true }))).toBe(true);
  });
  it('matches Tab', () => {
    expect(matchesShortcut('Tab', key({ key: 'Tab', code: 'Tab' }))).toBe(true);
  });
});
