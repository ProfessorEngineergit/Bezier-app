/**
 * Draw rate for Nib: every frame during a reaction, half of them for a blink or glance, 15 fps for
 * breathing, 8 fps asleep. Nothing is drawn or allocated between frames, so breathing alone costs
 * about 2 ms per second.
 */

export interface Activity {
  /** A reaction is playing. */
  reacting: boolean;
  /** The pointer moved a moment ago. */
  fresh: boolean;
  /** A blink is under way. */
  blinking: boolean;
  /** He is looking at something. */
  gazing: boolean;
  /** Asleep. */
  asleep: boolean;
}

/** Seconds between two drawn frames; 0 means draw on every animation frame. */
export function drawInterval(activity: Activity): number {
  if (activity.reacting || activity.fresh) return 0;
  if (activity.blinking || activity.gazing) return 1 / 30;
  if (activity.asleep) return 1 / 8;
  return 1 / 15;
}
