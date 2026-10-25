/**
 * Items on the timeline lanes: clips, gaps, chapter flags and zooms. Each is selectable; movable
 * ones are dragged with `drag`.
 */

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Clip } from '../format/clips.js';
import { clockFine } from '../format/clock.js';
import type { ZoomCue } from '../format/manifest.js';
import type { Chapter, Stretch } from '../format/timeline.js';
import { Icon } from '../ui/Icon.js';
import { drag } from './useDrag.js';

interface Lane {
  pixelsPerSecond: number;
}

const span = (stretch: Stretch, pps: number) => ({
  left: stretch.start * pps,
  width: Math.max(2, (stretch.end - stretch.start) * pps),
});

interface ClipProps extends Lane {
  clip: Clip;
  selected: boolean;
  onSelect: () => void;
  /** Press on the body (not an edge): selects the clip and moves the playhead there. */
  onPress: (event: ReactPointerEvent<HTMLElement>) => void;
  onTrim: (edge: 'start' | 'end', time: number) => void;
}

export function ClipBlock({
  clip,
  pixelsPerSecond,
  selected,
  onSelect,
  onPress,
  onTrim,
}: ClipProps) {
  const width = (clip.end - clip.start) * pixelsPerSecond;
  const edge = (side: 'start' | 'end') => (event: ReactPointerEvent<HTMLElement>) => {
    onSelect();
    drag(event, pixelsPerSecond, clip[side], (time) => onTrim(side, time));
  };
  return (
    <button
      aria-label={`Clip ${clip.index + 1}, ${clockFine(clip.start)} to ${clockFine(clip.end)}`}
      aria-pressed={selected}
      className="lessons-clip"
      onClick={onSelect}
      onPointerDown={onPress}
      style={span(clip, pixelsPerSecond)}
      type="button"
    >
      {width > 96 && (
        <span className="lessons-clip__label">
          {clockFine(clip.start)} – {clockFine(clip.end)}
        </span>
      )}
      {/* Dragging an edge trims the clip. */}
      <span
        aria-hidden="true"
        className="lessons-clip__edge"
        data-edge="start"
        onPointerDown={edge('start')}
      />
      <span
        aria-hidden="true"
        className="lessons-clip__edge"
        data-edge="end"
        onPointerDown={edge('end')}
      />
    </button>
  );
}

interface GapProps extends Lane {
  gap: Stretch;
  selected: boolean;
  onSelect: () => void;
  onPress: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function GapBlock({ gap, pixelsPerSecond, selected, onSelect, onPress }: GapProps) {
  return (
    <button
      aria-label={`Left out, ${clockFine(gap.start)} to ${clockFine(gap.end)}`}
      aria-pressed={selected}
      className="lessons-timeline__gap"
      onClick={onSelect}
      onPointerDown={onPress}
      style={span(gap, pixelsPerSecond)}
      type="button"
    />
  );
}

interface FlagProps extends Lane {
  chapter: Chapter;
  /** Width available to the label before the next flag. */
  room: number;
  current: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (time: number) => void;
  onMoved: () => void;
}

export function ChapterFlag({
  chapter,
  room,
  pixelsPerSecond,
  current,
  selected,
  onSelect,
  onMove,
  onMoved,
}: FlagProps) {
  const fixed = chapter.index === 0;
  return (
    <button
      aria-current={current ? 'step' : undefined}
      aria-label={`Chapter ${chapter.index + 1}, ${chapter.title}, at ${clockFine(chapter.time)}`}
      aria-pressed={selected}
      className="lessons-flag"
      data-fixed={fixed ? '' : undefined}
      onClick={onSelect}
      onPointerDown={(event) => {
        onSelect();
        if (!fixed) drag(event, pixelsPerSecond, chapter.time, onMove, onMoved);
      }}
      style={{ left: chapter.time * pixelsPerSecond, maxWidth: Math.max(18, room) }}
      type="button"
    >
      <span className="lessons-flag__pin" />
      <span className="lessons-flag__title">{chapter.title}</span>
    </button>
  );
}

interface ZoomProps extends Lane {
  zoom: ZoomCue;
  index: number;
  selected: boolean;
  onSelect: () => void;
}

export function ZoomBlock({ zoom, index, pixelsPerSecond, selected, onSelect }: ZoomProps) {
  return (
    <button
      aria-label={`Zoom ${zoom.scale}×, ${clockFine(zoom.start)} to ${clockFine(zoom.end)}`}
      aria-pressed={selected}
      className="lessons-zoom"
      key={index}
      onClick={onSelect}
      style={span(zoom, pixelsPerSecond)}
      type="button"
    >
      <Icon name="zoom-in" />
      <span>{zoom.scale}×</span>
    </button>
  );
}
