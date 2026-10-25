import {
  DEFAULT_NAVIGATION,
  type DragBinding,
  NAVIGATION_PRESETS,
  type NavAction,
  type NavigationPrefs,
  type NavigationPresetId,
} from '@bezier/renderer';

import { KEY_ACTIONS, KEYMAP_PRESETS, type KeymapPresetId } from '@bezier/ui';
import { DEFAULT_NIB_STYLE, type NibStyle, parseNibStyle } from './nib-style.js';

export type Theme = 'system' | 'light' | 'dark';
export type Quality = 'low' | 'medium' | 'high';
/**
 * Display detail while modelling. `auto` draws large models (imported assemblies) light and
 * everything else at `quality`.
 */
export type Detail = 'auto' | 'full' | 'light';
export type InterfaceScale = 'small' | 'default' | 'large';
export type Density = 'compact' | 'comfortable';
export type GlassMode = 'auto' | 'full' | 'reduced' | 'solid';
export type Contrast = 'standard' | 'high';
export type Motion = 'system' | 'reduced' | 'full';
export type StartupWorkspace = 'design' | 'visualize' | 'drawings';
export type StartPage = 'home' | 'projects';
/** Camera on open: top view, or the three-quarter view used for card pictures. */
export type OpenView = 'top' | 'angled';
export type UpdateChannel = 'stable' | 'beta';
/**
 * Nib: off; quiet (title bar, only crashes and lessons the user started); or friendly (also the
 * start page figure, greeting and notes).
 */
export type NibLevel = 'off' | 'quiet' | 'friendly';

/** Key bindings: a preset named after a tool, plus the user's overrides. */
export interface KeymapPrefs {
  preset: KeymapPresetId;
  /** Action id to key; an empty string means the action has no key. */
  overrides: Readonly<Record<string, string>>;
}

export interface AppPrefs {
  theme: Theme;
  interfaceScale: InterfaceScale;
  density: Density;
  /**
   * Panel glass. A new key with Automatic as default: the old `glassMode` was saved as Full for
   * everyone who never chose, so it is read only when it says Reduced or Solid.
   */
  glass: GlassMode;
  contrast: Contrast;
  motion: Motion;
  showLabels: boolean;
  showPerformance: boolean;
  quality: Quality;
  detail: Detail;
  /**
   * While the view moves: 0 keeps it sharp at any frame rate, 100 lowers the resolution as far as
   * needed to stay smooth (renderer `setMotionPreference`).
   */
  smoothness: number;
  navigation: NavigationPrefs;
  keymap: KeymapPrefs;
  startupWorkspace: StartupWorkspace;
  /** The page the app opens on: landing page or projects. */
  startPage: StartPage;
  openView: OpenView;
  updateChannel: UpdateChannel;
  /**
   * Lists the model's build steps under Items. Not in Settings; kept because browser tests drive
   * the model through its rows.
   */
  showHistory: boolean;
  /** Nib, the robot. Off loads and draws nothing. Replaces the boolean `showNib`. */
  nib: NibLevel;
  /** Name, colours and unprompted topics (`nib-style.ts`). */
  nibStyle: NibStyle;
  /**
   * Shows the stable reference of the selection. Not in Settings; browser tests turn it on to read
   * what they built.
   */
  showReferences: boolean;
  /**
   * The single selection colour, `#rrggbb`, for faces, edges, bodies, sketch lines and selection UI
   * (audit D12).
   */
  selectionColour: string;
}

/** Selection colours offered; any other `#rrggbb` is kept as is. */
export const SELECTION_COLOURS: readonly (readonly [string, string])[] = [
  ['#22b8e6', 'Cyan'],
  ['#0a84ff', 'Blue'],
  ['#34c759', 'Green'],
  ['#ff9f0a', 'Orange'],
  ['#ff375f', 'Pink'],
  ['#bf5af2', 'Purple'],
];

export const QUALITY_DEFLECTION: Record<Quality, number> = {
  low: 0.25,
  medium: 0.05,
  high: 0.012,
};

export const DEFAULT_PREFS: AppPrefs = {
  theme: 'system',
  interfaceScale: 'default',
  density: 'comfortable',
  glass: 'auto',
  contrast: 'standard',
  motion: 'system',
  showLabels: true,
  showPerformance: false,
  quality: 'medium',
  detail: 'auto',
  smoothness: 50,
  navigation: DEFAULT_NAVIGATION,
  keymap: { preset: 'native', overrides: {} },
  startupWorkspace: 'design',
  startPage: 'home',
  // A top view reads as a flat drawing rather than a solid.
  openView: 'angled',
  updateChannel: 'stable',
  showHistory: false,
  nib: 'quiet',
  nibStyle: DEFAULT_NIB_STYLE,
  showReferences: false,
  selectionColour: '#22b8e6',
};

export const PREFS_STORAGE_KEY = 'bezier.preferences';
export const PREFS_SCHEMA_VERSION = 1;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : {};
}

function member<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? (value as T) : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Merges unknown and older documents field by field, never trusting them wholesale. */
export function parsePrefs(value: unknown): AppPrefs {
  const envelope = record(value);
  const source = record('values' in envelope ? envelope.values : envelope);
  const navigation = record(source.navigation);
  return {
    theme: member(source.theme, ['system', 'light', 'dark'], DEFAULT_PREFS.theme),
    interfaceScale: member(
      source.interfaceScale,
      ['small', 'default', 'large'],
      DEFAULT_PREFS.interfaceScale,
    ),
    density: member(source.density, ['compact', 'comfortable'], DEFAULT_PREFS.density),
    glass: member(
      source.glass,
      ['auto', 'full', 'reduced', 'solid'],
      member(source.glassMode, ['reduced', 'solid'], DEFAULT_PREFS.glass),
    ),
    contrast: member(source.contrast, ['standard', 'high'], DEFAULT_PREFS.contrast),
    motion: member(source.motion, ['system', 'reduced', 'full'], DEFAULT_PREFS.motion),
    showLabels: boolean(source.showLabels, DEFAULT_PREFS.showLabels),
    showPerformance: boolean(source.showPerformance, DEFAULT_PREFS.showPerformance),
    quality: member(source.quality, ['low', 'medium', 'high'], DEFAULT_PREFS.quality),
    detail: member(source.detail, ['auto', 'full', 'light'], DEFAULT_PREFS.detail),
    smoothness: percent(source.smoothness, DEFAULT_PREFS.smoothness),
    navigation: parseNavigation(navigation),
    keymap: parseKeymap(record(source.keymap)),
    startupWorkspace: member(
      source.startupWorkspace,
      ['design', 'visualize', 'drawings'],
      DEFAULT_PREFS.startupWorkspace,
    ),
    startPage: member(source.startPage, ['home', 'projects'], DEFAULT_PREFS.startPage),
    openView: member(source.openView, ['top', 'angled'], DEFAULT_PREFS.openView),
    updateChannel: member(source.updateChannel, ['stable', 'beta'], DEFAULT_PREFS.updateChannel),
    showHistory: boolean(source.showHistory, DEFAULT_PREFS.showHistory),
    // "Show Nib" off maps to off; everyone else gets friendly.
    nib: member(
      source.nib,
      ['off', 'quiet', 'friendly'],
      source.showNib === false ? 'off' : DEFAULT_PREFS.nib,
    ),
    nibStyle: parseNibStyle(source.nibStyle),
    showReferences: boolean(source.showReferences, DEFAULT_PREFS.showReferences),
    selectionColour:
      typeof source.selectionColour === 'string' && /^#[0-9a-f]{6}$/i.test(source.selectionColour)
        ? source.selectionColour.toLowerCase()
        : DEFAULT_PREFS.selectionColour,
  };
}

const ACTIONS: readonly NavAction[] = ['orbit', 'pan', 'zoom'];

function parseKeymap(source: UnknownRecord): KeymapPrefs {
  const preset = member(
    source.preset,
    KEYMAP_PRESETS.map((entry) => entry.id),
    DEFAULT_PREFS.keymap.preset,
  ) as KeymapPresetId;
  const overrides: Record<string, string> = {};
  const known = new Set(KEY_ACTIONS.map((action) => action.id));
  for (const [id, key] of Object.entries(record(source.overrides))) {
    if (known.has(id) && typeof key === 'string' && key.length <= 40) overrides[id] = key;
  }
  return { preset, overrides };
}

/**
 * Navigation from stored data. The pre-preset `middle-orbit` scheme (middle orbits, right pans)
 * maps to the Native preset with those two drags overridden, so nothing changes on upgrade.
 */
function parseNavigation(source: UnknownRecord): NavigationPrefs {
  const invertZoom = boolean(source.invertZoom, DEFAULT_NAVIGATION.invertZoom);
  const scrollDevice = member(
    source.scrollDevice,
    ['auto', 'mouse', 'trackpad'],
    DEFAULT_NAVIGATION.scrollDevice,
  ) as NavigationPrefs['scrollDevice'];
  if (source.preset === undefined && source.scheme === 'middle-orbit') {
    return {
      preset: 'native',
      drags: { orbit: { action: 'orbit', button: 1 }, pan: { action: 'pan', button: 2 } },
      scrolls: {},
      invertZoom,
      scrollDevice,
    };
  }
  const preset = member(
    source.preset,
    NAVIGATION_PRESETS.map((entry) => entry.id),
    DEFAULT_NAVIGATION.preset,
  ) as NavigationPresetId;
  const drags: Partial<Record<NavAction, DragBinding>> = {};
  const storedDrags = record(source.drags);
  for (const action of ACTIONS) {
    const binding = record(storedDrags[action]);
    const button = binding.button;
    if (button !== 0 && button !== 1 && button !== 2) continue;
    drags[action] = {
      action,
      button,
      ...(binding.shift === true ? { shift: true } : {}),
      ...(binding.ctrl === true ? { ctrl: true } : {}),
      ...(binding.alt === true ? { alt: true } : {}),
      ...(binding.meta === true ? { meta: true } : {}),
    };
  }
  const storedScrolls = record(source.scrolls);
  const scrolls: Partial<Record<'plain' | 'shift', NavAction>> = {};
  for (const key of ['plain', 'shift'] as const) {
    const action = storedScrolls[key];
    if (action === 'orbit' || action === 'pan' || action === 'zoom') scrolls[key] = action;
  }
  return { preset, drags, scrolls, invertZoom, scrollDevice };
}

export function readPrefs(storage: Pick<Storage, 'getItem'> | null): AppPrefs {
  if (storage === null) return DEFAULT_PREFS;
  try {
    const stored = storage.getItem(PREFS_STORAGE_KEY);
    return stored === null ? DEFAULT_PREFS : parsePrefs(JSON.parse(stored));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function serializePrefs(prefs: AppPrefs): string {
  return JSON.stringify({ schemaVersion: PREFS_SCHEMA_VERSION, values: prefs });
}

/** An integer from 0 to 100, or the fallback. */
function percent(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(100, Math.max(0, value)))
    : fallback;
}
