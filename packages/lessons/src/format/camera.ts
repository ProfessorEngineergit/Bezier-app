/**
 * The corner of the author's camera picture at a given time. The author picks a corner (`avatar`
 * cues); the picture dodges clicks up to three seconds ahead, so the move is finished before the
 * click and it does not jump back the moment the click lands.
 */

import type { AvatarCorner, LessonManifest } from './manifest.js';

export const CORNERS: readonly AvatarCorner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

function inCorner(x: number, y: number, corner: AvatarCorner): boolean {
  return (
    (corner.includes('left') ? x < 0.42 : x > 0.58) &&
    (corner.includes('top') ? y < 0.42 : y > 0.58)
  );
}

/** The corner the author chose at `time`, before any dodging. */
export function chosenCorner(cues: readonly LessonManifest['avatar'][number][], time: number) {
  let corner: AvatarCorner = 'bottom-right';
  for (const cue of cues) if (cue.time <= time) corner = cue.corner;
  return corner;
}

export function cameraCornerAt(
  manifest: Pick<LessonManifest, 'avatar' | 'events'>,
  time: number,
): AvatarCorner {
  const chosen = chosenCorner(manifest.avatar, time);
  const risk = new Map<AvatarCorner, number>(CORNERS.map((corner) => [corner, 0]));
  for (const event of manifest.events) {
    if (event.time < time - 2 || event.time > time + 3) continue;
    if (event.kind !== 'click' && event.kind !== 'pointer') continue;
    for (const corner of CORNERS) {
      if (inCorner(event.x, event.y, corner)) {
        risk.set(corner, (risk.get(corner) ?? 0) + (event.kind === 'click' ? 4 : 1));
      }
    }
  }
  if ((risk.get(chosen) ?? 0) === 0) return chosen;
  return (
    CORNERS.filter((corner) => corner !== chosen).sort(
      (a, b) => (risk.get(a) ?? 0) - (risk.get(b) ?? 0),
    )[0] ?? chosen
  );
}
