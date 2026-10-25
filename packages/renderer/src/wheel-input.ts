/**
 * A wheel event as navigation reads it, on the canvas or forwarded from an overlay
 * (`useWheelThrough`). The legacy `wheelDeltaY` that tells a trackpad from a wheel
 * (`isTrackpadScroll`) cannot be set on a constructed WheelEvent (WebView2 reports +4 for a
 * trackpad's -12), so the shape is read from the original event and travels with the copy.
 */

export interface WheelShape {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  wheelDeltaY?: number;
}

const handedOn = new WeakMap<Event, WheelShape>();

/** The shape of this event, or of the one it was handed on from. */
export function wheelShape(event: WheelEvent): WheelShape {
  const carried = handedOn.get(event);
  if (carried !== undefined) return carried;
  const legacy = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    ctrlKey: event.ctrlKey,
    ...(legacy === undefined ? {} : { wheelDeltaY: legacy }),
  };
}

/** Send a wheel on to `target` as it came, the shape it was read with included. */
export function handOnWheel(event: WheelEvent, target: EventTarget): void {
  const copy = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  });
  handedOn.set(copy, wheelShape(event));
  target.dispatchEvent(copy);
}
