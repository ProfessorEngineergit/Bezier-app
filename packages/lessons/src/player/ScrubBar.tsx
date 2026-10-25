/**
 * The scrub bar with chapter segments. Seeks follow the pointer; arrow keys step five seconds. The
 * caller chooses the clock: playback time in the player, lesson time in the edit view.
 */

import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { clock } from '../format/clock.js';
import type { Stretch } from '../format/timeline.js';
import './scrub.css';
import { useFrames } from './useFrames.js';

export interface Segment {
  from: number;
  to: number;
  label: string;
}

interface Props {
  label: string;
  length: number;
  position: number;
  segments: readonly Segment[];
  /** Stretches drawn dimmed, such as the edit view's removed ones. */
  dimmed?: readonly Stretch[];
  /** Markers such as the In and Out points. */
  marks?: readonly { at: number; label: string }[];
  onSeek: (at: number) => void;
  /** Maps a bar position to lesson time, for the hover frame. */
  lessonTimeOf?: (position: number) => number;
}

const percent = (value: number, length: number) =>
  `${length > 0 ? Math.min(100, Math.max(0, (value / length) * 100)) : 0}%`;

export function ScrubBar({
  label,
  length,
  position,
  segments,
  dimmed,
  marks,
  onSeek,
  lessonTimeOf,
}: Props) {
  const frames = useFrames();
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const atPointer = (event: ReactPointerEvent) => {
    const rect = track.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return 0;
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return fraction * length;
  };

  const shown = hover ?? position;
  const frame =
    hover === null || lessonTimeOf === undefined
      ? null
      : (frames?.look(lessonTimeOf(hover)) ?? null);
  const segmentAt = segments.find((segment) => shown >= segment.from && shown < segment.to);

  return (
    <div
      aria-label={label}
      aria-valuemax={length}
      aria-valuemin={0}
      aria-valuenow={position}
      aria-valuetext={clock(position)}
      className="lessons-scrub"
      data-scrubbing={scrubbing ? '' : undefined}
      onKeyDown={(event) => {
        const step = { ArrowLeft: -5, ArrowRight: 5, Home: -length, End: length }[event.key];
        if (step === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        onSeek(Math.min(length, Math.max(0, position + step)));
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setScrubbing(true);
        onSeek(atPointer(event));
      }}
      onPointerLeave={() => setHover(null)}
      onPointerMove={(event) => {
        const at = atPointer(event);
        setHover(at);
        if (lessonTimeOf !== undefined) frames?.ask(lessonTimeOf(at));
        if (scrubbing) onSeek(at);
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setScrubbing(false);
      }}
      role="slider"
      tabIndex={0}
    >
      <div className="lessons-scrub__track" ref={track}>
        {segments.map((segment) => (
          <span
            className="lessons-scrub__segment"
            key={segment.from}
            style={{
              left: percent(segment.from, length),
              width: percent(segment.to - segment.from, length),
            }}
          >
            <span
              className="lessons-scrub__fill"
              style={{
                width:
                  position >= segment.to
                    ? '100%'
                    : percent(position - segment.from, segment.to - segment.from),
              }}
            />
          </span>
        ))}
        {dimmed?.map((stretch) => (
          <span
            className="lessons-scrub__dimmed"
            key={stretch.start}
            style={{
              left: percent(stretch.start, length),
              width: percent(stretch.end - stretch.start, length),
            }}
          />
        ))}
        {marks?.map((mark) => (
          <span
            className="lessons-scrub__mark"
            key={mark.label}
            style={{ left: percent(mark.at, length) }}
            title={`${mark.label} ${clock(mark.at)}`}
          >
            {mark.label}
          </span>
        ))}
      </div>
      <span className="lessons-scrub__knob" style={{ left: percent(position, length) }} />
      {hover !== null && (
        <span
          className="lessons-scrub__tip"
          data-frame={frame === null ? undefined : ''}
          style={{ left: percent(hover, length) }}
        >
          {frame !== null && <img alt="" className="lessons-scrub__frame" src={frame} />}
          <span className="lessons-scrub__tip-text">
            {clock(hover)}
            {segmentAt !== undefined && <span className="lessons-dim"> {segmentAt.label}</span>}
          </span>
        </span>
      )}
    </div>
  );
}
