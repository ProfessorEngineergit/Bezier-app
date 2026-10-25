/**
 * Draws the author's keys, clicks and pointer over the video. The recording itself contains no
 * cursor.
 */

import { type RefObject, useEffect, useState } from 'react';
import { clickAt, keyLabel, keysAt, pointerAt } from '../format/events.js';
import type { LessonEvent } from '../format/manifest.js';
import { isMac } from '../ui/platform.js';

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The video's picture rectangle inside its box, accounting for `object-fit: contain` bars. */
export function useVideoFrame(
  video: RefObject<HTMLVideoElement | null>,
  box: RefObject<HTMLElement | null>,
): Frame {
  const [frame, setFrame] = useState<Frame>({ left: 0, top: 0, width: 0, height: 0 });
  useEffect(() => {
    const element = video.current;
    const container = box.current;
    if (element === null || container === null) return;
    const measure = () => {
      const { clientWidth: w, clientHeight: h } = container;
      const vw = element.videoWidth || 16;
      const vh = element.videoHeight || 10;
      const scale = Math.min(w / vw, h / vh);
      const width = vw * scale;
      const height = vh * scale;
      setFrame({ left: (w - width) / 2, top: (h - height) / 2, width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    element.addEventListener('loadedmetadata', measure);
    return () => {
      observer.disconnect();
      element.removeEventListener('loadedmetadata', measure);
    };
  }, [video, box]);
  return frame;
}

interface Props {
  events: readonly LessonEvent[];
  time: number;
  frame: Frame;
  /** Smaller marks for the follow panel's small video. */
  compact?: boolean | undefined;
}

/** Pointer arrow path; its tip is the pointer position. */
const ARROW = 'M1 1v17.4l4.6-4.3 2.9 6.6 3.4-1.5-2.9-6.4H15z';

export function Overlays({ events, time, frame, compact }: Props) {
  const mac = isMac();
  const keys = keysAt(events, time);
  const click = clickAt(events, time);
  const pointer = pointerAt(events, time);
  const at = (x: number, y: number) => ({ left: `${x * 100}%`, top: `${y * 100}%` });
  return (
    <div
      aria-hidden="true"
      className="lessons-overlays"
      data-compact={compact ? '' : undefined}
      style={{
        left: frame.left,
        top: frame.top,
        width: frame.width || '100%',
        height: frame.height || '100%',
      }}
    >
      {click !== undefined && (
        <span className="lessons-ripple" key={click.time} style={at(click.x, click.y)} />
      )}
      {pointer !== undefined && (
        <svg
          className="lessons-pointer"
          data-pressed={click !== undefined ? '' : undefined}
          role="img"
          style={at(pointer.x, pointer.y)}
          viewBox="0 0 20 22"
        >
          <title>The author's pointer</title>
          <path d={ARROW} />
        </svg>
      )}
      {keys.length > 0 && (
        <div className="lessons-keys">
          {keys.map((key) => (
            <kbd className="lessons-kbd" key={key.time}>
              {keyLabel(key, mac)}
            </kbd>
          ))}
        </div>
      )}
    </div>
  );
}
