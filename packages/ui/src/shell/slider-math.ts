/**
 * Slider value math for drag, typing and stepping. Pure, so snapping, fine drag, step rounding and
 * vertical drag direction are tested in Node.
 */

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Rounds to the step (counted from `min`) and clamps to the range. */
export function quantise(value: number, { min, max, step }: SliderRange): number {
  const stepped = step > 0 ? min + Math.round((value - min) / step) * step : value;
  // Removes float error from the step (0.05 * 7 = 0.35000000000000003).
  const decimals = Math.max(0, Math.ceil(-Math.log10(step > 0 ? step : 1)) + 1);
  return clamp(Number(stepped.toFixed(decimals)), min, max);
}

/** Position of a value along the track, 0 to 1. */
export function fraction(value: number, { min, max }: SliderRange): number {
  return max === min ? 0 : clamp((value - min) / (max - min), 0, 1);
}

/** Snap distance to a stop, as a fraction of the range. */
export const MAGNET = 0.035;

/** The stop a value snaps to, or the value itself if none is close enough. */
export function magnet(value: number, stops: readonly number[], range: SliderRange): number {
  const reach = (range.max - range.min) * MAGNET;
  let best = value;
  let bestDistance = reach;
  for (const stop of stops) {
    const distance = Math.abs(stop - value);
    if (distance <= bestDistance) {
      best = stop;
      bestDistance = distance;
    }
  }
  return best;
}

/** Vertical drag distance in pixels that covers the whole range. */
export const VERTICAL_SPAN = 220;
/** Speed divisor for a fine drag (Shift or Option held). */
export const FINE = 0.1;

/**
 * The value after dragging from `start` by (`dx`, `dy`) pixels over a `width`-pixel track.
 * Horizontal follows the track 1:1; up raises and down lowers, `VERTICAL_SPAN` pixels per full
 * range. Fine drags move at a tenth of the speed without snapping.
 */
export function dragged(
  start: number,
  dx: number,
  dy: number,
  width: number,
  range: SliderRange,
  stops: readonly number[],
  fine: boolean,
): number {
  const span = range.max - range.min;
  const sideways = width > 0 ? (dx / width) * span : 0;
  const upwards = (-dy / VERTICAL_SPAN) * span;
  const raw = clamp(start + (sideways + upwards) * (fine ? FINE : 1), range.min, range.max);
  // Fine drags use a tenth of the step, so values between the stops are reachable.
  if (fine) return quantise(raw, { ...range, step: range.step / 10 });
  return quantise(magnet(raw, stops, range), range);
}

/** Parses a typed value leniently: decimal comma, trailing unit, spaces. */
export function typed(text: string, range: SliderRange): number | null {
  const match = /-?\d+(?:[.,]\d+)?/.exec(text.replace(/\s/g, ''));
  if (match === null) return null;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? quantise(value, range) : null;
}

/** One keyboard step: arrows by the step, Shift by ten steps. */
/**
 * Scroll distance for a slider in gesture pixels, signed so fingers moving right or up raise the
 * value. Browsers report content movement, not finger movement: with natural scrolling (the Mac
 * default, for trackpads and mice) fingers right give negative `deltaX` and fingers up positive
 * `deltaY`. `inverted` says whether natural scrolling is on.
 */
export function scrollTravel(deltaX: number, deltaY: number, inverted: boolean): number {
  const sideways = Math.abs(deltaX) > Math.abs(deltaY);
  if (inverted) return sideways ? -deltaX : deltaY;
  return sideways ? deltaX : -deltaY;
}

export function stepped(value: number, direction: number, big: boolean, range: SliderRange) {
  return quantise(value + direction * range.step * (big ? 10 : 1), range);
}
