/**
 * The edit view's timeline: ruler, chapter flags, clips and gaps, zooms and the playhead. Scrolls
 * horizontally when zoomed; pressing the ruler or an empty lane scrubs. Uses lesson time (gaps
 * included) so the author sees what is left out.
 */

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { type Clip, gaps } from '../format/clips.js';
import { clockFine } from '../format/clock.js';
import type { LessonManifest } from '../format/manifest.js';
import type { Chapter } from '../format/timeline.js';
import { Icon } from '../ui/Icon.js';
import { Ruler } from './Ruler.js';
import type { Selection, TrimPoints } from './selection.js';
import { snapTime } from './snap.js';
import { ChapterFlag, ClipBlock, GapBlock, ZoomBlock } from './TimelineLanes.js';
import { drag } from './useDrag.js';

interface Props {
  manifest: LessonManifest;
  clips: readonly Clip[];
  chapters: readonly Chapter[];
  current: Chapter | undefined;
  time: number;
  playing: boolean;
  points: TrimPoints;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onSeek: (time: number) => void;
  onTrim: (index: number, edge: 'start' | 'end', time: number) => void;
  onMoveChapter: (index: number, time: number) => void;
}

/** Maximum zoom in pixels per second. */
const MAX_PPS = 800;
const ZOOM_STEP = 1.6;
/** Horizontal padding in pixels on either side of the recording. */
const PAD = 12;

export function Timeline(props: Props) {
  const { manifest, clips, chapters, time, playing, points, selection, onSelect, onSeek } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /** Pixels per second chosen by zooming; null fits the whole recording. */
  const [chosen, setChosen] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const length = Math.max(0.1, manifest.duration);

  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = Math.max(1, (width - 2 * PAD) / length);
  const pps = chosen === null ? fit : Math.min(MAX_PPS, Math.max(fit, chosen));
  const zoomed = pps > fit * 1.01;

  // Scroll to follow the playhead during playback.
  useEffect(() => {
    const element = scroller.current;
    if (element === null || !playing) return;
    const x = time * pps + PAD;
    if (x < element.scrollLeft || x > element.scrollLeft + element.clientWidth - 40) {
      element.scrollLeft = Math.max(0, x - element.clientWidth * 0.2);
    }
  }, [time, pps, playing]);

  const atPointer = (event: ReactPointerEvent<HTMLElement>): number => {
    const element = scroller.current;
    if (element === null) return 0;
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left + element.scrollLeft - PAD;
    return Math.min(length, Math.max(0, x / pps));
  };

  /**
   * Moves the playhead to the pointer and follows the drag. Used for the ruler, empty lanes and,
   * via `onPress`, clips and gaps (which are also selected), so a split lands where the user
   * pressed.
   */
  const scrub = (event: ReactPointerEvent<HTMLElement>, keepSelection = false) => {
    if (!keepSelection) onSelect(null);
    const from = atPointer(event);
    onSeek(from);
    setScrubbing(true);
    drag(
      event,
      pps,
      from,
      (at) => onSeek(Math.min(length, Math.max(0, at))),
      () => setScrubbing(false),
    );
  };
  const onStripPress = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      (event.target as Element).closest(
        '.lessons-flag, .lessons-clip, .lessons-zoom, .lessons-timeline__gap',
      ) !== null
    )
      return;
    scrub(event);
  };

  /** Snaps a dragged edge or flag to a nearby target. */
  const snapped = (at: number, own: number | null): number => {
    const targets = [0, length, time];
    for (const clip of clips) targets.push(clip.start, clip.end);
    for (const chapter of chapters) targets.push(chapter.time);
    if (points.in !== null) targets.push(points.in);
    if (points.out !== null) targets.push(points.out);
    return snapTime(
      at,
      targets.filter((target) => target !== own),
      pps,
    );
  };

  const zoomBy = (factor: number) => {
    const element = scroller.current;
    const next = Math.min(MAX_PPS, Math.max(fit, pps * factor));
    setChosen(next <= fit ? null : next);
    // Keep the playhead at the same screen position while zooming.
    if (element !== null) {
      const onScreen = time * pps + PAD - element.scrollLeft;
      requestAnimationFrame(() => {
        element.scrollLeft = Math.max(0, time * next + PAD - onScreen);
      });
    }
  };

  const lanes = { pixelsPerSecond: pps };
  const is = (kind: string, index: number) =>
    selection !== null &&
    selection.kind === kind &&
    'index' in selection &&
    selection.index === index;
  const playhead = time * pps;
  const zooms = manifest.zooms ?? [];

  return (
    <div className="lessons-timeline" data-scrubbing={scrubbing ? '' : undefined}>
      <div className="lessons-timeline__zoom">
        <button
          aria-label="Zoom the timeline out"
          className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
          disabled={!zoomed}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          type="button"
        >
          <Icon name="minus" />
        </button>
        <button
          aria-label="Fit the whole recording"
          className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
          disabled={!zoomed}
          onClick={() => setChosen(null)}
          type="button"
        >
          <Icon name="fit" />
        </button>
        <button
          aria-label="Zoom the timeline in"
          className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
          disabled={pps >= MAX_PPS}
          onClick={() => zoomBy(ZOOM_STEP)}
          type="button"
        >
          <Icon name="plus" />
        </button>
      </div>
      <div
        className="lessons-timeline__scroll"
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
        }}
        ref={scroller}
      >
        <div
          className="lessons-timeline__strip"
          onPointerDown={onStripPress}
          style={{ width: length * pps + 2 * PAD, paddingLeft: PAD, paddingRight: PAD }}
        >
          <Ruler length={length} pixelsPerSecond={pps} />
          <div className="lessons-timeline__lane lessons-timeline__lane--chapters">
            {chapters.map((chapter, i) => (
              <ChapterFlag
                chapter={chapter}
                current={chapter.index === props.current?.index}
                key={`${chapter.index}-${chapter.time}`}
                onMove={(at) => props.onMoveChapter(chapter.index, snapped(at, chapter.time))}
                onMoved={() => undefined}
                onSelect={() => onSelect({ kind: 'chapter', index: chapter.index })}
                room={((chapters[i + 1]?.time ?? length) - chapter.time) * pps - 6}
                selected={is('chapter', chapter.index)}
                {...lanes}
              />
            ))}
          </div>
          <div className="lessons-timeline__lane lessons-timeline__lane--clips">
            {clips.map((clip) => (
              <ClipBlock
                clip={clip}
                key={clip.index}
                onPress={(event) => {
                  onSelect({ kind: 'clip', index: clip.index });
                  scrub(event, true);
                }}
                onSelect={() => onSelect({ kind: 'clip', index: clip.index })}
                onTrim={(edge, at) => {
                  const to = snapped(at, clip[edge]);
                  props.onTrim(clip.index, edge, to);
                  // Show the frame at the dragged edge.
                  onSeek(to);
                }}
                selected={is('clip', clip.index)}
                {...lanes}
              />
            ))}
            {gaps(clips, length).map((gap) => (
              <GapBlock
                gap={gap}
                key={gap.start}
                onPress={(event) => {
                  onSelect({ kind: 'gap', stretch: gap });
                  scrub(event, true);
                }}
                onSelect={() => onSelect({ kind: 'gap', stretch: gap })}
                selected={
                  selection?.kind === 'gap' &&
                  selection.stretch.start === gap.start &&
                  selection.stretch.end === gap.end
                }
                {...lanes}
              />
            ))}
          </div>
          <div className="lessons-timeline__lane lessons-timeline__lane--zooms">
            {zooms.length === 0 && (
              <span className="lessons-timeline__hint lessons-faint">
                Z zooms in on the pointer between In and Out
              </span>
            )}
            {zooms.map((zoom, index) => (
              <ZoomBlock
                index={index}
                key={zoom.start}
                onSelect={() => onSelect({ kind: 'zoom', index })}
                selected={is('zoom', index)}
                zoom={zoom}
                {...lanes}
              />
            ))}
          </div>
          {points.in !== null && (
            <span className="lessons-timeline__mark" style={{ left: points.in * pps + PAD }}>
              I
            </span>
          )}
          {points.out !== null && (
            <span
              className="lessons-timeline__mark"
              data-out=""
              style={{ left: points.out * pps + PAD }}
            >
              O
            </span>
          )}
          {points.in !== null && points.out !== null && points.out > points.in && (
            <span
              className="lessons-timeline__between"
              style={{ left: points.in * pps + PAD, width: (points.out - points.in) * pps }}
            />
          )}
          <div className="lessons-playhead" style={{ left: playhead + PAD }}>
            <span className="lessons-playhead__time lessons-glass">{clockFine(time)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
