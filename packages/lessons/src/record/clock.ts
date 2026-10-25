/**
 * The recording clock: seconds recorded so far, excluding pauses. `MediaRecorder.pause` leaves no
 * gap in the media, so lesson time must not include one either.
 */

export interface RecordingClock {
  /** Seconds recorded, excluding pauses. */
  elapsed(): number;
  paused(): boolean;
  pause(): void;
  resume(): void;
}

export function recordingClock(now: () => number = () => performance.now()): RecordingClock {
  let banked = 0;
  let runningSince: number | null = now();
  return {
    elapsed: () =>
      Math.max(0, (banked + (runningSince === null ? 0 : now() - runningSince)) / 1000),
    paused: () => runningSince === null,
    pause() {
      if (runningSince === null) return;
      banked += now() - runningSince;
      runningSince = null;
    },
    resume() {
      if (runningSince === null) runningSince = now();
    },
  };
}
