/**
 * Input settings: mouse and trackpad camera bindings and the keymap. Both start from a preset named
 * after another tool (Bezier's own by default); each action can be overridden and reset to the
 * preset.
 */

import {
  DRAG_CHOICES,
  type DragBinding,
  describeDrag,
  NAVIGATION_PRESETS,
  type NavAction,
  type NavigationPresetId,
  presetById,
} from '@bezier/renderer';
import {
  EDITOR_SHORTCUTS,
  KEY_ACTIONS,
  KEYMAP_PRESETS,
  type KeyActionGroup,
  type KeymapPresetId,
  keyConflicts,
  resolveKeymap,
} from '@bezier/ui';
import { useEffect, useState } from 'react';
import { NavigationGestures } from './NavigationGestures.js';
import { Group, Keys, Row, Select, Switch } from './PrefsControls.js';
import type { AppPrefs } from './preferences.js';
import './prefs-input.css';

type Setter = <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => void;

const ACTION_LABEL: Record<NavAction, string> = { orbit: 'Orbit', pan: 'Pan', zoom: 'Zoom' };
const PRESET_VALUE = 'preset';

/** Encodes a drag binding as a select value. */
function dragKey(binding: Omit<DragBinding, 'action'>): string {
  return [
    binding.button,
    binding.shift ? 's' : '',
    binding.ctrl ? 'c' : '',
    binding.alt ? 'a' : '',
    binding.meta ? 'm' : '',
  ].join('');
}

function presetDrag(preset: NavigationPresetId, action: NavAction): DragBinding | undefined {
  return presetById(preset).drags.find((binding) => binding.action === action);
}

export function NavigationSettings({ prefs, set }: { prefs: AppPrefs; set: Setter }) {
  const navigation = prefs.navigation;
  const change = (next: Partial<AppPrefs['navigation']>) =>
    set('navigation', { ...navigation, ...next });
  const preset = presetById(navigation.preset);
  const changedMoves =
    Object.keys(navigation.drags).length + Object.keys(navigation.scrolls).length;
  const scrollOf = (key: 'plain' | 'shift') =>
    preset.scrolls.find((binding) =>
      key === 'plain'
        ? !binding.shift && !binding.ctrl && !binding.alt && !binding.meta
        : binding.shift === true && !binding.ctrl && !binding.alt && !binding.meta,
    )?.action;

  return (
    <>
      <Group
        label="Navigation preset"
        note="How the mouse and trackpad move the camera, the way the named tool does it. Every action below can then be changed on its own."
      >
        <Row label="Navigate like">
          <Select
            label="Navigate like"
            onChange={(id) => change({ preset: id as NavigationPresetId, drags: {}, scrolls: {} })}
            options={NAVIGATION_PRESETS.map((entry) => [entry.id, entry.label] as const)}
            value={navigation.preset}
          />
        </Row>
        <NavigationGestures
          drags={navigation.drags}
          preset={navigation.preset}
          scrolls={navigation.scrolls}
        />
        {changedMoves > 0 && (
          <Row
            label={changedMoves === 1 ? '1 action changed' : `${changedMoves} actions changed`}
            note={`Back to how ${preset.label} moves the camera.`}
          >
            <button
              className="prefs-button"
              onClick={() => change({ drags: {}, scrolls: {} })}
              type="button"
            >
              Reset All Mouse Bindings
            </button>
          </Row>
        )}
      </Group>

      <Group label="Mouse">
        {(['orbit', 'pan', 'zoom'] as const).map((action) => {
          const own = navigation.drags[action];
          const fromPreset = presetDrag(navigation.preset, action);
          return (
            <Row
              key={action}
              label={ACTION_LABEL[action]}
              note={own === undefined ? 'From the preset' : 'Changed'}
            >
              <Select
                label={`${ACTION_LABEL[action]} with`}
                onChange={(value) => {
                  const drags = { ...navigation.drags };
                  const choice = DRAG_CHOICES.find((candidate) => dragKey(candidate) === value);
                  if (value === PRESET_VALUE || choice === undefined) delete drags[action];
                  else drags[action] = { ...choice, action };
                  change({ drags });
                }}
                options={[
                  [
                    PRESET_VALUE,
                    fromPreset === undefined
                      ? `${preset.label}: wheel only`
                      : `${preset.label}: ${describeDrag(fromPreset)}`,
                  ] as const,
                  ...DRAG_CHOICES.map((choice) => [dragKey(choice), describeDrag(choice)] as const),
                ]}
                value={own === undefined ? PRESET_VALUE : dragKey(own)}
              />
            </Row>
          );
        })}
        <Row label="Wheel zooms the other way">
          <Switch
            checked={navigation.invertZoom}
            label="Invert scroll direction"
            onChange={(invertZoom) => change({ invertZoom })}
          />
        </Row>
      </Group>

      <Group
        label="Scrolling comes from"
        note="Browsers do not say whether a scroll is a mouse wheel or a trackpad, so it is guessed. If the wheel orbits instead of zooming, or two fingers zoom instead of orbiting, say which you use."
      >
        <Row label="Device">
          <Select
            label="Scrolling device"
            onChange={(value) =>
              change({ scrollDevice: value as AppPrefs['navigation']['scrollDevice'] })
            }
            options={[
              ['auto', 'Work it out'],
              ['mouse', 'Mouse wheel'],
              ['trackpad', 'Trackpad'],
            ]}
            value={navigation.scrollDevice}
          />
        </Row>
      </Group>

      <Group label="Trackpad" note="A pinch always zooms.">
        {(['plain', 'shift'] as const).map((key) => (
          <Row key={key} label={key === 'plain' ? 'Two fingers' : 'Shift + two fingers'}>
            <Select
              label={key === 'plain' ? 'Two fingers' : 'Shift + two fingers'}
              onChange={(value) => {
                const scrolls = { ...navigation.scrolls };
                if (value === PRESET_VALUE) delete scrolls[key];
                else scrolls[key] = value as NavAction;
                change({ scrolls });
              }}
              options={[
                [
                  PRESET_VALUE,
                  `${preset.label}: ${ACTION_LABEL[scrollOf(key) ?? 'zoom']}`,
                ] as const,
                ['orbit', 'Orbit'] as const,
                ['pan', 'Pan'] as const,
                ['zoom', 'Zoom'] as const,
              ]}
              value={navigation.scrolls[key] ?? PRESET_VALUE}
            />
          </Row>
        ))}
      </Group>
    </>
  );
}

const GROUPS: readonly KeyActionGroup[] = [
  'Sketch',
  'Constraints',
  'Modeling',
  'View',
  'Edit',
  'Selection',
  'App',
];

/** Formats a key press as stored in the keymap, e.g. "Shift+Cmd+U". */
function shortcutFromEvent(event: KeyboardEvent): string | null {
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return null;
  const apple = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  const parts: string[] = [];
  if (apple ? event.metaKey : event.ctrlKey) parts.push('Cmd');
  if (apple && event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const code = event.code;
  const key =
    event.key === ' '
      ? 'Space'
      : code.startsWith('Key')
        ? code.slice(3)
        : code.startsWith('Digit')
          ? code.slice(5)
          : event.key.length === 1
            ? event.key.toUpperCase()
            : event.key;
  parts.push(key);
  return parts.join('+');
}

export function ShortcutSettings({ prefs, set }: { prefs: AppPrefs; set: Setter }) {
  const keymap = prefs.keymap;
  const resolved = resolveKeymap(keymap.preset, keymap.overrides);
  const conflicts = keyConflicts(resolved);
  const clash = new Set([...conflicts.values()].flat());
  const [recording, setRecording] = useState<string | null>(null);
  const changedCount = Object.keys(keymap.overrides).length;
  const presetLabel = KEYMAP_PRESETS.find((entry) => entry.id === keymap.preset)?.label ?? 'preset';

  // While recording, the next key press is the new shortcut. Escape cancels.
  useEffect(() => {
    if (recording === null) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }
      const shortcut = shortcutFromEvent(event);
      if (shortcut === null) return;
      set('keymap', { ...keymap, overrides: { ...keymap.overrides, [recording]: shortcut } });
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [recording, keymap, set]);

  const reset = (id: string) => {
    const overrides = { ...keymap.overrides };
    delete overrides[id];
    set('keymap', { ...keymap, overrides });
  };

  return (
    <>
      <Group
        label="Shortcut preset"
        note="Keys the way the named tool uses them. Click a key below to record a new one; Escape cancels."
      >
        <Row label="Keys like">
          <Select
            label="Keys like"
            onChange={(id) => set('keymap', { preset: id as KeymapPresetId, overrides: {} })}
            options={KEYMAP_PRESETS.map((entry) => [entry.id, entry.label] as const)}
            value={keymap.preset}
          />
        </Row>
        {/* Shown only when something has changed. */}
        {changedCount > 0 && (
          <Row
            label={changedCount === 1 ? '1 key changed' : `${changedCount} keys changed`}
            note={`Back to the ${presetLabel} keys, every change undone.`}
          >
            <button
              className="prefs-button"
              onClick={() => set('keymap', { ...keymap, overrides: {} })}
              type="button"
            >
              Reset All Key Bindings
            </button>
          </Row>
        )}
      </Group>
      {GROUPS.map((group) => (
        <Group key={group} label={group}>
          {KEY_ACTIONS.filter((action) => action.group === group).map((action) => {
            const key = resolved.get(action.id);
            const changed = keymap.overrides[action.id] !== undefined;
            return (
              <Row
                key={action.id}
                label={action.label}
                note={
                  clash.has(action.id)
                    ? 'Shares its key with another action'
                    : changed
                      ? 'Changed'
                      : undefined
                }
              >
                <span className="prefs-shortcut">
                  <button
                    aria-label={`Shortcut for ${action.label}`}
                    className="prefs-shortcut__key"
                    onClick={() => setRecording(action.id)}
                    type="button"
                  >
                    {recording === action.id ? (
                      'Press keys…'
                    ) : key === undefined ? (
                      'None'
                    ) : (
                      <Keys value={key} />
                    )}
                  </button>
                  {changed && (
                    <button
                      className="prefs-shortcut__reset"
                      onClick={() => reset(action.id)}
                      type="button"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    aria-label={`Remove the shortcut for ${action.label}`}
                    className="prefs-shortcut__reset"
                    onClick={() =>
                      set('keymap', {
                        ...keymap,
                        overrides: { ...keymap.overrides, [action.id]: '' },
                      })
                    }
                    type="button"
                  >
                    Clear
                  </button>
                </span>
              </Row>
            );
          })}
        </Group>
      ))}
      <Group label="Always">
        {EDITOR_SHORTCUTS.map((item) => (
          <Row key={`${item.keys}/${item.scope ?? ''}`} label={item.label} note={item.scope}>
            <Keys value={item.keys} />
          </Row>
        ))}
      </Group>
    </>
  );
}
