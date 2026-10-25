/**
 * Navigation tuning and input routing for the viewport's OrbitControls. The constants are tuned
 * together (e.g. rotate speed against damping) and applied once when the controls are built.
 */

import { MOUSE, type PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  actionForPress,
  actionForTrackpadScroll,
  DEFAULT_PRESET,
  type DragBinding,
  isPinch,
  isTrackpadScroll,
  type Modifiers,
  type NavAction,
  type NavigationMap,
  type NavigationPresetId,
  resolveNavigation,
} from './navigation-map.js';
import { allowTumble } from './tumble.js';
import { wheelShape } from './wheel-input.js';

/**
 * Closest the eye may get, in millimetres: far below what the kernel resolves, for work on
 * sub-millimetre features. The near plane follows the camera, so it does not limit this.
 */
const MIN_DISTANCE = 0.005;

/**
 * Farthest the eye may retreat, in millimetres (100 m): a limit against getting lost, far enough
 * not to be hit in ordinary use.
 */
const MAX_DISTANCE = 100_000;

/**
 * The same limits for a parallel projection, which zooms without moving so `minDistance` and
 * `maxDistance` do not apply. Ratios against the frustum the view was squared up with.
 */
const MIN_ZOOM = 0.001;
const MAX_ZOOM = 100_000;

/** A drag turns the model about as far as the pointer travels (the library default is slower). */
const ROTATE_SPEED = 1.15;

/**
 * Share of a pending movement spent per frame, per gesture (`dampingFactor` is set as each gesture
 * starts). Pans glide; rotation uses 1, i.e. no damping, since lag and overshoot on a rotate feel
 * like mouse acceleration.
 */
const ROTATE_DAMPING = 1;
const PAN_DAMPING = 0.25;

/**
 * Zoom per wheel notch, shared by both projections (dolly and frustum) so they feel alike. Set
 * explicitly rather than left at the library default.
 */
const ZOOM_SPEED = 1;

/** The user's navigation: a preset, with each action overridable (`navigation-map.ts`). */
export interface NavigationPrefs {
  preset: NavigationPresetId;
  /** Mouse drags changed from the preset, by action. */
  drags: Partial<Record<NavAction, DragBinding>>;
  /** Two-finger trackpad scrolls changed from the preset: plain, and with Shift. */
  scrolls: Partial<Record<'plain' | 'shift', NavAction>>;
  /** Whether pushing the wheel away pulls the model closer. */
  invertZoom: boolean;
  /**
   * What a scroll comes from. `auto` guesses from the event (`isTrackpadScroll`); the guess can be
   * wrong in WebKit, so the user can say.
   */
  scrollDevice: 'auto' | 'mouse' | 'trackpad';
}

export const DEFAULT_NAVIGATION: NavigationPrefs = {
  preset: DEFAULT_PRESET,
  drags: {},
  scrolls: {},
  invertZoom: false,
  scrollDevice: 'auto',
};

/** How long a pause ends a trackpad gesture, in milliseconds. */
const GESTURE_GAP_MS = 250;

/** How a press's damping is chosen: a pan glides, an orbit stops with the hand. */
export function dampingFor(action: NavAction | null): number {
  return action === 'pan' ? PAN_DAMPING : ROTATE_DAMPING;
}

/**
 * The OrbitControls constant that makes a press do `action`. OrbitControls swaps orbit and pan
 * while Shift, Ctrl or Cmd is held, so the swap is pre-empted here for mappings that use those
 * keys.
 */
export function mouseFor(action: NavAction | null, modifierHeld: boolean): MOUSE {
  if (action === 'zoom') return MOUSE.DOLLY;
  if (action === 'orbit') return modifierHeld ? MOUSE.PAN : MOUSE.ROTATE;
  if (action === 'pan') return modifierHeld ? MOUSE.ROTATE : MOUSE.PAN;
  return -1 as MOUSE;
}

/** The parts of OrbitControls a trackpad gesture drives directly (three 0.185). */
interface OrbitInternals {
  _rotateLeft(angle: number): void;
  _rotateUp(angle: number): void;
  _pan(deltaX: number, deltaY: number): void;
}

/**
 * Minimum eye-to-pivot distance, as a share of the model's reach (half its diagonal). Each wheel
 * step covers a share of the distance to the pivot, so without this the eye approaches a surface
 * asymptotically; with it, zoom passes through walls at a steady pace.
 */
const NEAREST_PIVOT = 0.1;

/**
 * Where the zoom pivots, given `hit` under the cursor (or null) and the model's `reach` (null:
 * nothing built). Writes the new target into `out`; false leaves the target where it is.
 *
 * The target moves along the view axis to the depth of the surface under the cursor, since
 * zoom-to-cursor stops at `minDistance` from the target. Moving along the axis rather than to the
 * hit keeps the view from turning.
 */
export function zoomPivot(
  eye: Vector3,
  target: Vector3,
  hit: Vector3 | null,
  reach: number | null,
  out: Vector3,
): boolean {
  out.copy(target).sub(eye);
  const length = out.length();
  if (length === 0) return false;
  const axis = out.divideScalar(length);
  let depth =
    hit === null
      ? length
      : (hit.x - eye.x) * axis.x + (hit.y - eye.y) * axis.y + (hit.z - eye.z) * axis.z;
  if (hit !== null && depth < MIN_DISTANCE) {
    // Behind the eye or at it: nothing to pivot on there.
    if (reach === null) return false;
    depth = length;
  }
  if (reach !== null && reach > 0) depth = Math.max(depth, reach * NEAREST_PIVOT);
  else if (hit === null) return false;
  out.multiplyScalar(depth).add(eye);
  return true;
}

/**
 * A world point on the surface under a pixel of the canvas (CSS pixels from its corner), or null.
 */
export type SurfaceProbe = (x: number, y: number) => { x: number; y: number; z: number } | null;

/** Wheel events closer together than this share one probe. */
const PROBE_GAP_MS = 60;

export interface NavigationInput {
  /** Swap in new preferences; the listeners stay the ones installed. */
  set(prefs: NavigationPrefs): void;
  /** Where the surface is under the cursor, so zooming can pivot on it. */
  setProbe(probe: SurfaceProbe | null): void;
  /** How far the model reaches (half its diagonal, mm), or null with nothing built. */
  setReach(reach: (() => number | null) | null): void;
  /** Told when automatic detection reads a scroll as a different device than the last one. */
  onDetect(listener: ((device: 'mouse' | 'trackpad') => void) | null): void;
  /** Whether a press with these buttons and keys belongs to navigation, not selection. */
  claims(event: {
    button: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  }): boolean;
  dispose(): void;
}

function modifiersOf(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): Modifiers {
  return { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey };
}

/**
 * Applies navigation settings to fresh controls and installs the input layer once; later
 * preference changes swap its map instead of adding listeners.
 */
export function installNavigation(
  controls: OrbitControls,
  prefs: NavigationPrefs = DEFAULT_NAVIGATION,
): NavigationInput {
  allowTumble(controls);
  controls.enableDamping = true;
  controls.dampingFactor = ROTATE_DAMPING;
  controls.rotateSpeed = ROTATE_SPEED;
  // Zoom toward the cursor, not the screen centre.
  controls.zoomToCursor = true;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.minZoom = MIN_ZOOM;
  controls.maxZoom = MAX_ZOOM;
  // Every press is routed below; nothing is bound until one starts.
  controls.mouseButtons = { LEFT: -1 as MOUSE, MIDDLE: -1 as MOUSE, RIGHT: -1 as MOUSE };

  let map: NavigationMap = resolveNavigation(prefs.preset, prefs.drags, prefs.scrolls);
  let device: NavigationPrefs['scrollDevice'] = prefs.scrollDevice;
  const apply = (next: NavigationPrefs) => {
    map = resolveNavigation(next.preset, next.drags, next.scrolls);
    device = next.scrollDevice;
    // Negative reverses the wheel; OrbitControls multiplies by this.
    controls.zoomSpeed = next.invertZoom ? -ZOOM_SPEED : ZOOM_SPEED;
  };
  apply(prefs);

  const element = controls.domElement as HTMLElement | null;
  // Chosen as the press starts, in the capture phase, so the binding is in place before
  // OrbitControls' own handler reads it on the same event.
  const onPress = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const action = actionForPress(map, event.button, modifiersOf(event));
    const held = event.ctrlKey || event.metaKey || event.shiftKey;
    const binding = mouseFor(action, held);
    controls.mouseButtons = {
      LEFT: event.button === 0 ? binding : (-1 as MOUSE),
      MIDDLE: event.button === 1 ? binding : (-1 as MOUSE),
      RIGHT: event.button === 2 ? binding : (-1 as MOUSE),
    };
    controls.dampingFactor = dampingFor(action);
  };
  // Two-finger trackpad scrolls orbit or pan per the preset; pinches and real wheels go to
  // OrbitControls' zoom. A fast push mixes in large steps that look like a wheel, so once a scroll
  // reads as a trackpad, the rest of that gesture is treated the same.
  let trackpadUntil = 0;
  let detectListener: ((device: 'mouse' | 'trackpad') => void) | null = null;
  let detected: 'mouse' | 'trackpad' | null = null;
  const detect = (found: 'mouse' | 'trackpad') => {
    if (found === detected) return;
    detected = found;
    detectListener?.(found);
  };
  let probe: SurfaceProbe | null = null;
  let reachOf: (() => number | null) | null = null;
  let probedAt = -Infinity;
  const slid = new Vector3();
  const hit = new Vector3();
  /** Moves the orbit target to the surface under the cursor before a zoom step (`zoomPivot`). */
  const pivotOnSurface = (event: WheelEvent) => {
    const camera = controls.object as PerspectiveCamera;
    if (probe === null || element === null || camera.isPerspectiveCamera !== true) return;
    if (event.timeStamp - probedAt < PROBE_GAP_MS) return;
    probedAt = event.timeStamp;
    const box = element.getBoundingClientRect();
    const found = probe(event.clientX - box.left, event.clientY - box.top);
    if (found !== null) hit.set(found.x, found.y, found.z);
    const moved = zoomPivot(
      camera.position,
      controls.target,
      found === null ? null : hit,
      reachOf?.() ?? null,
      slid,
    );
    if (moved) controls.target.copy(slid);
  };
  const onWheel = (event: WheelEvent) => {
    const shape = wheelShape(event);
    if (isPinch(shape)) {
      pivotOnSurface(event);
      return;
    }
    const now = event.timeStamp;
    const trackpad =
      device === 'trackpad' ||
      (device === 'auto' && (now < trackpadUntil || isTrackpadScroll(shape)));
    if (device === 'auto') detect(trackpad ? 'trackpad' : 'mouse');
    if (!trackpad) {
      pivotOnSurface(event);
      return;
    }
    trackpadUntil = now + GESTURE_GAP_MS;
    const action = actionForTrackpadScroll(map, modifiersOf(event));
    if (action === 'zoom') {
      pivotOnSurface(event);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (action === null || element === null) return;
    const internals = controls as unknown as OrbitInternals;
    const height = element.clientHeight || 1;
    if (action === 'orbit') {
      internals._rotateLeft(((2 * Math.PI * -event.deltaX) / height) * controls.rotateSpeed);
      internals._rotateUp(((2 * Math.PI * -event.deltaY) / height) * controls.rotateSpeed);
    } else {
      internals._pan(-event.deltaX, -event.deltaY);
    }
    controls.update();
  };
  element?.addEventListener('pointerdown', onPress, { capture: true });
  element?.addEventListener('wheel', onWheel, { capture: true, passive: false });

  return {
    set: apply,
    setProbe: (next) => {
      probe = next;
    },
    setReach: (next) => {
      reachOf = next;
    },
    onDetect: (listener) => {
      detectListener = listener;
      if (listener !== null && detected !== null) listener(detected);
    },
    claims: (event) => actionForPress(map, event.button, modifiersOf(event)) !== null,
    dispose: () => {
      element?.removeEventListener('pointerdown', onPress, { capture: true });
      element?.removeEventListener('wheel', onWheel, { capture: true });
    },
  };
}
