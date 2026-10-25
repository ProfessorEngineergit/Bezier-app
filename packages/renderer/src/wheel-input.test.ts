import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTrackpadScroll } from './navigation-map.js';
import { handOnWheel, wheelShape } from './wheel-input.js';

/**
 * Node has no WheelEvent. This one does what WebView2 does to a constructed event: it makes the
 * legacy wheelDeltaY up from the delta, +4 for a deltaY of 4.
 */
class MadeUpWheel extends Event {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaZ: number;
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
  readonly wheelDeltaY: number;
  constructor(type: string, init: WheelEventInit = {}) {
    super(type, init);
    this.deltaX = init.deltaX ?? 0;
    this.deltaY = init.deltaY ?? 0;
    this.deltaZ = init.deltaZ ?? 0;
    this.deltaMode = init.deltaMode ?? 0;
    this.ctrlKey = init.ctrlKey ?? false;
    this.wheelDeltaY = this.deltaY;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('a wheel handed on from a handle over the canvas', () => {
  it('is read as the trackpad it came from, not as the wheel its copy looks like', () => {
    vi.stubGlobal('WheelEvent', MadeUpWheel);
    // A WebView2 trackpad event: pixel deltaY 4, legacy -12.
    const original = new MadeUpWheel('wheel', { deltaY: 4 });
    Object.defineProperty(original, 'wheelDeltaY', { value: -12 });
    const canvas = new EventTarget();
    let read: ReturnType<typeof wheelShape> | null = null;
    let copy: MadeUpWheel | null = null;
    canvas.addEventListener('wheel', (event) => {
      copy = event as MadeUpWheel;
      read = wheelShape(event as unknown as WheelEvent);
    });
    handOnWheel(original as unknown as WheelEvent, canvas);
    expect(copy).not.toBe(original);
    // What the copy says by itself: a wheel.
    expect(copy && isTrackpadScroll(copy)).toBe(false);
    // What navigation reads: the trackpad, as beside the handle.
    expect(read).toEqual({ deltaX: 0, deltaY: 4, deltaMode: 0, ctrlKey: false, wheelDeltaY: -12 });
    expect(read && isTrackpadScroll(read)).toBe(true);
  });

  it('reads an event the browser made as it is', () => {
    const event = new MadeUpWheel('wheel', { deltaY: 100, ctrlKey: true });
    expect(wheelShape(event as unknown as WheelEvent)).toEqual({
      deltaX: 0,
      deltaY: 100,
      deltaMode: 0,
      ctrlKey: true,
      wheelDeltaY: 100,
    });
  });
});
