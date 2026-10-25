/**
 * Mouse and trackpad navigation mappings as data: presets named after the tool they copy, each
 * action overridable in Settings.
 *
 * Native: right-drag orbits, middle-drag or Shift+right-drag pans, the wheel zooms; on a trackpad
 * two fingers orbit, Shift+two fingers pan, a pinch zooms. Other presets follow each application's
 * documented defaults. CATIA is not offered: its button chords do not fit this model.
 */

export type NavAction = 'orbit' | 'pan' | 'zoom';

/** 0 left, 1 middle, 2 right, as `PointerEvent.button` numbers them. */
export type MouseButton = 0 | 1 | 2;

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  /** Cmd on a Mac, the Windows key elsewhere. */
  meta: boolean;
}

export interface DragBinding {
  action: NavAction;
  button: MouseButton;
  shift?: true;
  ctrl?: true;
  alt?: true;
  meta?: true;
}

/** A two-finger trackpad scroll, with whichever modifiers are held. */
export interface ScrollBinding {
  action: NavAction;
  shift?: true;
  ctrl?: true;
  alt?: true;
  meta?: true;
}

export type NavigationPresetId =
  | 'native'
  | 'blender'
  | 'fusion360'
  | 'solidworks'
  | 'onshape'
  | 'rhino'
  | 'sketchup'
  | 'nx'
  | 'alias'
  | 'inventor';

export interface NavigationMap {
  drags: readonly DragBinding[];
  /** Two-finger scrolls. A pinch always zooms, as every trackpad expects. */
  scrolls: readonly ScrollBinding[];
}

export interface NavigationPreset extends NavigationMap {
  id: NavigationPresetId;
  label: string;
}

const drag = (action: NavAction, button: MouseButton, mods: Partial<Modifiers> = {}): DragBinding =>
  ({ action, button, ...onlyTrue(mods) }) as DragBinding;
const scroll = (action: NavAction, mods: Partial<Modifiers> = {}): ScrollBinding =>
  ({ action, ...onlyTrue(mods) }) as ScrollBinding;

function onlyTrue(mods: Partial<Modifiers>): Partial<Record<keyof Modifiers, true>> {
  const out: Partial<Record<keyof Modifiers, true>> = {};
  for (const key of ['shift', 'ctrl', 'alt', 'meta'] as const)
    if (mods[key] === true) out[key] = true;
  return out;
}

const RIGHT: MouseButton = 2;
const MIDDLE: MouseButton = 1;
const LEFT: MouseButton = 0;

export const NAVIGATION_PRESETS: readonly NavigationPreset[] = [
  {
    id: 'native',
    label: 'Native',
    drags: [drag('orbit', RIGHT), drag('pan', MIDDLE), drag('pan', RIGHT, { shift: true })],
    // On a trackpad two fingers orbit, Shift with two fingers pans and a pinch zooms.
    scrolls: [scroll('orbit'), scroll('pan', { shift: true })],
  },
  {
    id: 'blender',
    label: 'Blender',
    drags: [
      drag('orbit', MIDDLE),
      drag('pan', MIDDLE, { shift: true }),
      drag('zoom', MIDDLE, { ctrl: true }),
    ],
    scrolls: [scroll('orbit'), scroll('pan', { shift: true }), scroll('zoom', { ctrl: true })],
  },
  {
    id: 'fusion360',
    label: 'Fusion 360',
    drags: [drag('pan', MIDDLE), drag('orbit', MIDDLE, { shift: true })],
    scrolls: [scroll('pan'), scroll('orbit', { shift: true })],
  },
  {
    id: 'solidworks',
    label: 'SolidWorks',
    drags: [
      drag('orbit', MIDDLE),
      drag('pan', MIDDLE, { ctrl: true }),
      drag('zoom', MIDDLE, { shift: true }),
    ],
    scrolls: [scroll('orbit'), scroll('pan', { ctrl: true })],
  },
  {
    id: 'onshape',
    label: 'Onshape',
    drags: [drag('orbit', RIGHT), drag('pan', MIDDLE), drag('pan', RIGHT, { ctrl: true })],
    scrolls: [scroll('orbit'), scroll('pan', { shift: true })],
  },
  {
    id: 'rhino',
    label: 'Rhino',
    drags: [
      drag('orbit', RIGHT),
      drag('pan', RIGHT, { shift: true }),
      drag('zoom', RIGHT, { ctrl: true }),
    ],
    scrolls: [scroll('orbit'), scroll('pan', { shift: true })],
  },
  {
    id: 'sketchup',
    label: 'SketchUp',
    drags: [drag('orbit', MIDDLE), drag('pan', MIDDLE, { shift: true })],
    scrolls: [scroll('orbit'), scroll('pan', { shift: true })],
  },
  {
    id: 'nx',
    label: 'Siemens NX',
    drags: [
      drag('orbit', MIDDLE),
      drag('pan', MIDDLE, { shift: true }),
      drag('zoom', MIDDLE, { ctrl: true }),
    ],
    scrolls: [scroll('orbit'), scroll('pan', { shift: true })],
  },
  {
    // Middle drag pans; with Shift it orbits.
    id: 'inventor',
    label: 'Inventor',
    drags: [drag('pan', MIDDLE), drag('orbit', MIDDLE, { shift: true })],
    scrolls: [scroll('pan'), scroll('orbit', { shift: true })],
  },
  {
    id: 'alias',
    label: 'Alias',
    drags: [
      drag('orbit', LEFT, { alt: true, shift: true }),
      drag('pan', MIDDLE, { alt: true, shift: true }),
      drag('zoom', RIGHT, { alt: true, shift: true }),
    ],
    scrolls: [scroll('orbit'), scroll('pan', { shift: true })],
  },
];

export const DEFAULT_PRESET: NavigationPresetId = 'native';

export function presetById(id: NavigationPresetId): NavigationPreset {
  return (
    NAVIGATION_PRESETS.find((preset) => preset.id === id) ??
    (NAVIGATION_PRESETS[0] as NavigationPreset)
  );
}

function matches(binding: Partial<Modifiers>, mods: Modifiers): boolean {
  return (
    (binding.shift === true) === mods.shift &&
    (binding.ctrl === true) === mods.ctrl &&
    (binding.alt === true) === mods.alt &&
    (binding.meta === true) === mods.meta
  );
}

/** What a press starts: a navigation, or nothing (selection keeps the press). */
export function actionForPress(
  map: NavigationMap,
  button: number,
  mods: Modifiers,
): NavAction | null {
  return (
    map.drags.find((binding) => binding.button === button && matches(binding, mods))?.action ?? null
  );
}

/** What a two-finger trackpad scroll does with these modifiers, or null. */
export function actionForScroll(map: NavigationMap, mods: Modifiers): NavAction | null {
  return map.scrolls.find((binding) => matches(binding, mods))?.action ?? null;
}

/**
 * What a trackpad scroll does. An unbound Ctrl scroll zooms like a pinch, which covers WebView2's
 * whole-step Ctrl+wheel (deltaY 2) that `isPinch` does not match.
 */
export function actionForTrackpadScroll(map: NavigationMap, mods: Modifiers): NavAction | null {
  return actionForScroll(map, mods) ?? (mods.ctrl ? 'zoom' : null);
}

/**
 * Whether a wheel event is a trackpad two-finger scroll rather than a mouse wheel or pinch. A
 * heuristic (Settings can override it via `scrollDevice`): trackpads also move sideways, in
 * fractional or small steps; wheels move in larger whole notches; a pinch has Ctrl held.
 *
 * Legacy `wheelDeltaY` is only a hint: Chromium reports -3x the pixel delta for a trackpad and 120
 * for a wheel notch, but WebKit reports -3x for a wheel too, so the ratio counts only for small
 * steps.
 */
export function isTrackpadScroll(event: {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  wheelDeltaY?: number;
}): boolean {
  if (event.ctrlKey) return false;
  if (event.deltaMode !== 0) return false;
  if (event.deltaX !== 0) return true;
  if (!Number.isInteger(event.deltaY)) return true;
  const y = Math.abs(event.deltaY);
  if (event.wheelDeltaY !== undefined && event.wheelDeltaY !== 0) {
    return event.wheelDeltaY === -3 * event.deltaY && y < 50;
  }
  return !(y >= 50 && (y % 100 === 0 || y % 120 === 0));
}

/** A pinch on a trackpad: the browser reports it as a wheel with Ctrl held. */
export function isPinch(event: { ctrlKey: boolean; deltaMode: number; deltaY: number }): boolean {
  return event.ctrlKey && event.deltaMode === 0 && !Number.isInteger(event.deltaY);
}

/** The effective map: a preset, with each overridden action swapped in. */
export function resolveNavigation(
  preset: NavigationPresetId,
  overrides: Partial<Record<NavAction, DragBinding>>,
  scrollOverrides: Partial<Record<'plain' | 'shift', NavAction>>,
): NavigationMap {
  const base = presetById(preset);
  const overridden = new Set(Object.keys(overrides));
  const chosen = Object.values(overrides).filter(
    (binding): binding is DragBinding => binding !== undefined,
  );
  const sameGesture = (a: DragBinding, b: DragBinding) =>
    a.button === b.button &&
    a.shift === b.shift &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.meta === b.meta;
  // An override replaces any preset binding on the same button and keys.
  const drags = [
    ...chosen,
    ...base.drags.filter(
      (binding) =>
        !overridden.has(binding.action) && !chosen.some((mine) => sameGesture(mine, binding)),
    ),
  ];
  const scrolls = base.scrolls.filter((binding) => {
    const plain = !binding.shift && !binding.ctrl && !binding.alt && !binding.meta;
    const shiftOnly = binding.shift === true && !binding.ctrl && !binding.alt && !binding.meta;
    return (
      !(plain && scrollOverrides.plain !== undefined) &&
      !(shiftOnly && scrollOverrides.shift !== undefined)
    );
  });
  if (scrollOverrides.plain !== undefined) scrolls.push(scroll(scrollOverrides.plain));
  if (scrollOverrides.shift !== undefined)
    scrolls.push(scroll(scrollOverrides.shift, { shift: true }));
  return { drags, scrolls };
}

/** "Shift + right drag", for Settings. */
export function describeDrag(binding: Omit<DragBinding, 'action'>): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Cmd');
  parts.push(`${['Left', 'Middle', 'Right'][binding.button]} drag`);
  return parts.join(' + ');
}

/** Every button-and-modifier combination Settings offers for one action. */
export const DRAG_CHOICES: readonly Omit<DragBinding, 'action'>[] = (() => {
  const out: Omit<DragBinding, 'action'>[] = [];
  for (const button of [RIGHT, MIDDLE, LEFT] as const) {
    for (const mods of [
      {},
      { shift: true },
      { ctrl: true },
      { alt: true },
      { alt: true, shift: true },
    ] as const) {
      // A plain left drag is selection, and stays selection.
      if (button === LEFT && Object.keys(mods).length === 0) continue;
      out.push({ button, ...mods } as Omit<DragBinding, 'action'>);
    }
  }
  return out;
})();
