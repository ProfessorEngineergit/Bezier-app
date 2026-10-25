/**
 * Which hand does what, checked as data (`navigation-map.ts`) and as the OrbitControls binding a
 * press turns into (`navigation.ts`).
 */

import { MOUSE, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { dampingFor, mouseFor, zoomPivot } from './navigation.js';
import {
  actionForPress,
  actionForScroll,
  actionForTrackpadScroll,
  isPinch,
  isTrackpadScroll,
  NAVIGATION_PRESETS,
  presetById,
  resolveNavigation,
} from './navigation-map.js';

const none = { shift: false, ctrl: false, alt: false, meta: false };
const shift = { ...none, shift: true };
const ctrl = { ...none, ctrl: true };

describe('the Native preset', () => {
  const map = presetById('native');
  it('orbits with a right drag and pans with a middle drag or Shift + right drag', () => {
    expect(actionForPress(map, 2, none)).toBe('orbit');
    expect(actionForPress(map, 1, none)).toBe('pan');
    expect(actionForPress(map, 2, shift)).toBe('pan');
  });
  it('orbits with two fingers on a trackpad and pans with Shift and two fingers', () => {
    expect(actionForScroll(map, none)).toBe('orbit');
    expect(actionForScroll(map, shift)).toBe('pan');
  });
  it('never takes a plain left press, which is selection', () => {
    for (const preset of NAVIGATION_PRESETS) expect(actionForPress(preset, 0, none)).toBeNull();
  });
});

describe('other presets', () => {
  it('Blender orbits with the middle button and pans with Shift', () => {
    const map = presetById('blender');
    expect(actionForPress(map, 1, none)).toBe('orbit');
    expect(actionForPress(map, 1, shift)).toBe('pan');
    expect(actionForPress(map, 1, ctrl)).toBe('zoom');
  });
  it('Fusion 360 pans with the middle button and orbits with Shift', () => {
    const map = presetById('fusion360');
    expect(actionForPress(map, 1, none)).toBe('pan');
    expect(actionForPress(map, 1, shift)).toBe('orbit');
  });
  it('Alias takes the left button only with Alt and Shift held', () => {
    const map = presetById('alias');
    expect(actionForPress(map, 0, { ...none, alt: true, shift: true })).toBe('orbit');
    expect(actionForPress(map, 0, shift)).toBeNull();
  });
});

describe('overriding one action', () => {
  it('replaces that action and leaves the rest of the preset', () => {
    const map = resolveNavigation('native', { orbit: { action: 'orbit', button: 1 } }, {});
    expect(actionForPress(map, 1, none)).toBe('orbit');
    expect(actionForPress(map, 2, none)).toBeNull();
    expect(actionForPress(map, 2, shift)).toBe('pan');
  });
  it('replaces a trackpad gesture', () => {
    const map = resolveNavigation('native', {}, { plain: 'orbit', shift: 'pan' });
    expect(actionForScroll(map, none)).toBe('orbit');
    expect(actionForScroll(map, shift)).toBe('pan');
  });
});

describe('telling a trackpad from a wheel', () => {
  it('reads a small pixel delta as a two-finger scroll', () => {
    expect(isTrackpadScroll({ deltaX: 0, deltaY: 3.5, deltaMode: 0, ctrlKey: false })).toBe(true);
    expect(isTrackpadScroll({ deltaX: 4, deltaY: 0, deltaMode: 0, ctrlKey: false })).toBe(true);
  });
  it('reads whole notches as a mouse wheel', () => {
    expect(isTrackpadScroll({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false })).toBe(false);
    expect(isTrackpadScroll({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false })).toBe(false);
  });
  it('trusts the legacy delta only for small steps', () => {
    expect(
      isTrackpadScroll({ deltaX: 0, deltaY: 12, deltaMode: 0, ctrlKey: false, wheelDeltaY: -36 }),
    ).toBe(true);
    // WebKit's wheel notch: -3 times as well, but a whole, large step.
    expect(
      isTrackpadScroll({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, wheelDeltaY: -300 }),
    ).toBe(false);
    expect(
      isTrackpadScroll({ deltaX: 0, deltaY: 4, deltaMode: 0, ctrlKey: false, wheelDeltaY: -120 }),
    ).toBe(false);
  });
  it('reads a Ctrl wheel with fractional delta as a pinch', () => {
    expect(isPinch({ ctrlKey: true, deltaMode: 0, deltaY: 1.7 })).toBe(true);
    expect(isTrackpadScroll({ deltaX: 0, deltaY: 1.7, deltaMode: 0, ctrlKey: true })).toBe(false);
  });
  it('zooms with a Ctrl scroll in whole steps where no binding takes Ctrl', () => {
    // WebView2's Ctrl+wheel with deltaY 2 in the trackpad mode.
    expect(isPinch({ ctrlKey: true, deltaMode: 0, deltaY: 2 })).toBe(false);
    expect(actionForTrackpadScroll(presetById('native'), ctrl)).toBe('zoom');
    // A preset that binds Ctrl keeps it: SolidWorks pans with it.
    expect(actionForTrackpadScroll(presetById('solidworks'), ctrl)).toBe('pan');
    expect(actionForTrackpadScroll(presetById('native'), none)).toBe('orbit');
    expect(actionForTrackpadScroll(presetById('native'), { ...none, alt: true })).toBeNull();
  });
});

describe('the binding a press becomes', () => {
  it('undoes OrbitControls swapping orbit and pan when a modifier is held', () => {
    expect(mouseFor('pan', true)).toBe(MOUSE.ROTATE);
    expect(mouseFor('orbit', true)).toBe(MOUSE.PAN);
    expect(mouseFor('orbit', false)).toBe(MOUSE.ROTATE);
    expect(mouseFor('zoom', true)).toBe(MOUSE.DOLLY);
    expect(mouseFor(null, false)).toBe(-1);
  });
  it('lets a pan glide and stops an orbit with the hand', () => {
    expect(dampingFor('orbit')).toBe(1);
    expect(dampingFor('pan')).toBeLessThan(1);
    expect(dampingFor('pan')).toBeGreaterThan(0);
  });
});

describe('pivoting a zoom on the surface under the cursor', () => {
  const eye = new Vector3(0, -100, 0);
  const target = new Vector3(0, 0, 0);

  it('slides the target along the view axis to the depth of the hit', () => {
    const out = new Vector3();
    // A face 30 mm in front of the eye's line to the target, off to one side.
    expect(zoomPivot(eye, target, new Vector3(5, -70, 2), null, out)).toBe(true);
    expect(out.toArray()).toEqual([0, -70, 0]);
    // On a model the wall is far from: the same.
    expect(zoomPivot(eye, target, new Vector3(5, -70, 2), 100, out)).toBe(true);
    expect(out.toArray()).toEqual([0, -70, 0]);
  });

  it('ignores a point behind the eye', () => {
    expect(zoomPivot(eye, target, new Vector3(0, -200, 0), null, new Vector3())).toBe(false);
  });

  it('keeps the pivot ahead of a wall the eye has come up to, so the next steps go through', () => {
    const out = new Vector3();
    // A part 40 mm across, the eye half a millimetre from its face: the pivot 2 mm ahead.
    expect(zoomPivot(eye, target, new Vector3(0, -99.5, 0), 20, out)).toBe(true);
    expect(out.y).toBeCloseTo(-98, 6);
  });

  it('keeps zooming in fine short of the wall', () => {
    const out = new Vector3();
    zoomPivot(eye, target, new Vector3(0, -40, 0), 20, out);
    expect(out.y).toBeCloseTo(-40, 6);
  });

  it('pivots ahead in empty space too, rather than on a point at the eye', () => {
    const out = new Vector3();
    expect(zoomPivot(eye, new Vector3(0, -99.99, 0), null, 20, out)).toBe(true);
    expect(out.y).toBeCloseTo(-98, 6);
  });
});
