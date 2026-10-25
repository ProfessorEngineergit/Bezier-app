/** The video, the author's camera in its corner, and the overlays. */

import './play-mark.css';
import { type RefObject, useMemo, useRef } from 'react';
import { cameraCornerAt } from '../format/camera.js';
import { pointerAt, sortedEvents } from '../format/events.js';
import type { LessonEvent, StoredLesson } from '../format/manifest.js';
import { focusOn, zoomAt } from '../format/zoom.js';
import { Icon } from '../ui/Icon.js';
import { useMediaUrl } from '../ui/useMediaUrl.js';
import { type Frame, Overlays, useVideoFrame } from './Overlays.js';
import type { Playback } from './usePlayback.js';

interface Props {
  lesson: StoredLesson;
  playback: Playback;
  /** The box the stage fills; also the full-screen target. */
  box: RefObject<HTMLDivElement | null>;
  compact?: boolean;
  /** The camera is shown separately as a tile (follow/Speaker.tsx). */
  separateCamera?: boolean;
  onDoubleClick?: () => void;
}

/**
 * The zoom transform for the lesson's `zooms`: the picture is scaled around a point that loosely
 * follows the pointer (see `focusOn`), smoothed by a CSS transition.
 */
function useZoomedView(
  manifest: StoredLesson['manifest'],
  events: readonly LessonEvent[],
  time: number,
  frame: Frame,
): string | undefined {
  const centre = useRef({ x: 0.5, y: 0.5 });
  const scale = zoomAt(manifest, time);
  if (scale < 1.001) {
    centre.current = { x: 0.5, y: 0.5 };
    return undefined;
  }
  const pointer = pointerAt(events, time);
  const boxWidth = frame.width + 2 * frame.left;
  const boxHeight = frame.height + 2 * frame.top;
  const inBox =
    pointer === undefined || boxWidth === 0 || boxHeight === 0
      ? undefined
      : {
          x: (frame.left + pointer.x * frame.width) / boxWidth,
          y: (frame.top + pointer.y * frame.height) / boxHeight,
        };
  centre.current = focusOn(centre.current, inBox, scale);
  const { x, y } = centre.current;
  return `translate(${(0.5 - x * scale) * 100}%, ${(0.5 - y * scale) * 100}%) scale(${scale})`;
}

export function Stage({ lesson, playback, box, compact, onDoubleClick, separateCamera }: Props) {
  const viewportUrl = useMediaUrl(lesson.viewport);
  const cameraUrl = useMediaUrl(lesson.camera);
  const events = useMemo(() => sortedEvents(lesson.manifest.events), [lesson.manifest.events]);
  const frame = useVideoFrame(playback.video, box);
  const corner = cameraCornerAt(lesson.manifest, playback.time);
  const transform = useZoomedView(lesson.manifest, events, playback.time, frame);

  return (
    <div
      className="lessons-stage"
      data-compact={compact ? '' : undefined}
      data-playing={playback.playing ? '' : undefined}
      data-zoomed={transform === undefined ? undefined : ''}
      ref={box}
    >
      <div className="lessons-stage__view" style={transform === undefined ? {} : { transform }}>
        {/* Clicking the picture toggles playback, as in most video players. */}
        <button
          aria-label={playback.playing ? 'Pause' : 'Play'}
          className="lessons-stage__surface"
          onClick={playback.toggle}
          onDoubleClick={onDoubleClick}
          type="button"
        >
          <video
            aria-label={`${lesson.manifest.title}, the recording`}
            playsInline
            preload="auto"
            ref={playback.video}
            src={viewportUrl || undefined}
          >
            <track kind="captions" />
          </video>
        </button>
        <Overlays compact={compact} events={events} frame={frame} time={playback.time} />
      </div>
      {cameraUrl !== '' && separateCamera !== true && (
        <video
          aria-label="The author"
          className="lessons-stage__camera"
          data-corner={corner}
          muted
          playsInline
          preload="auto"
          ref={playback.camera}
          src={cameraUrl}
        >
          <track kind="captions" />
        </video>
      )}
      {/* Always rendered; stage.css animates it on play and pause instead of mounting it. */}
      <span aria-hidden="true" className="lessons-stage__play">
        <Icon name={playback.ended ? 'restore' : 'play'} size={compact ? 20 : 32} />
      </span>
    </div>
  );
}
