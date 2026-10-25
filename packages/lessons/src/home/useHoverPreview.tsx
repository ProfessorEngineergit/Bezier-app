/**
 * Hover preview for lesson cards. The recording loads after a short dwell; moving across the
 * picture scrubs in playback time (cuts excluded), and resting the pointer plays it muted. A track
 * and the chapter name show the position. Mouse only; on touch the card simply opens.
 */

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLessons } from '../app/context.js';
import type { StoredLesson } from '../format/manifest.js';
import {
  chapterAt,
  chapters as chaptersOf,
  keptStretches,
  playableDuration,
  playableMoment,
  toLesson,
  toPlayback,
} from '../format/timeline.js';
import { useMediaUrl } from '../ui/useMediaUrl.js';
import './preview.css';

/** Hover time before the recording loads, so sweeping past costs nothing. */
const DWELL_MS = 240;
/** Time the pointer must rest before playback starts. */
const REST_MS = 650;

interface Options {
  id: string;
  /** Lesson time to start at; the continue card passes its progress. */
  startAt?: number;
  /** The element the pointer moves over. */
  surface: RefObject<HTMLElement | null>;
}

export function useHoverPreview({ id, startAt = 0, surface }: Options) {
  const lessons = useLessons();
  const [active, setActive] = useState(false);
  const [lesson, setLesson] = useState<StoredLesson | null>(null);
  const [ready, setReady] = useState(false);
  const [fraction, setFraction] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const dwell = useRef(0);
  const rest = useRef(0);
  const frame = useRef(0);
  const wanted = useRef<number | null>(null);
  const across = useRef<number | null>(null);
  const hovered = useRef(false);
  const movedAt = useRef(0);
  const url = useMediaUrl(active ? lesson?.viewport : undefined);

  const manifest = lesson?.manifest;
  const kept = useMemo(() => (manifest === undefined ? [] : keptStretches(manifest)), [manifest]);
  const playable = useMemo(() => playableDuration(kept), [kept]);
  const chapters = useMemo(
    () => (manifest === undefined ? [] : chaptersOf(manifest, kept)),
    [manifest, kept],
  );

  const stop = useCallback(() => {
    hovered.current = false;
    window.clearTimeout(dwell.current);
    window.clearTimeout(rest.current);
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    wanted.current = null;
    across.current = null;
    video.current?.pause();
    setActive(false);
    setReady(false);
    setFraction(null);
  }, []);

  useEffect(() => stop, [stop]);

  // Switching apps does not fire pointerleave, so stop the preview when the page is hidden.
  useEffect(() => {
    if (!active) return;
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [active, stop]);

  useEffect(() => {
    if (url === '') return;
    const element = video.current;
    // React clears the ref before unmount cleanup; the captured element must still be paused.
    return () => element?.pause();
  }, [url]);

  // Load after the dwell; the app caches the most recent lesson.
  useEffect(() => {
    if (!active || lesson !== null) return;
    let cancelled = false;
    void lessons
      .load(id)
      .then((found) => {
        if (!cancelled) setLesson(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, lesson, id, lessons]);

  const play = useCallback(() => {
    const element = video.current;
    if (!hovered.current || element === null || element.readyState < 2 || element.seeking) return;
    void element
      .play()
      .then(() => {
        // A pending play can finish after the card has gone away or acquired a different video.
        if (!hovered.current || video.current !== element) element.pause();
      })
      .catch(() => undefined);
  }, []);

  const schedulePlay = useCallback(() => {
    window.clearTimeout(rest.current);
    rest.current = window.setTimeout(play, Math.max(0, REST_MS - (Date.now() - movedAt.current)));
  }, [play]);

  useEffect(() => {
    // Readiness, not another mouse movement, starts a preview whose pointer has come to rest.
    if (active && ready) schedulePlay();
    return () => window.clearTimeout(rest.current);
  }, [active, ready, schedulePlay]);

  const onSeeked = useCallback(() => {
    if (!hovered.current) return;
    setReady(true);
    if (video.current?.paused) schedulePlay();
  }, [schedulePlay]);

  // Seek to the start position before showing the video.
  const onLoaded = useCallback(() => {
    const element = video.current;
    if (!hovered.current || element === null) return;
    const from =
      across.current === null
        ? (playableMoment(kept, startAt) ?? kept[0]?.start ?? 0)
        : toLesson(kept, Math.min(across.current * playable, Math.max(0, playable - 0.02)));
    setFraction(playable > 0 ? toPlayback(kept, from) / playable : 0);
    // Seeking the frame already decoded does not emit seeked in every browser.
    if (Math.abs(element.currentTime - from) < 0.001) onSeeked();
    else element.currentTime = from;
  }, [kept, startAt, playable, onSeeked]);

  const seekTo = useCallback((lessonTime: number) => {
    wanted.current = lessonTime;
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const element = video.current;
      if (
        hovered.current &&
        element !== null &&
        element.readyState >= 1 &&
        wanted.current !== null
      ) {
        element.currentTime = wanted.current;
      }
    });
  }, []);

  const onEnded = useCallback(() => {
    const element = video.current;
    if (!hovered.current || element === null) return;
    element.currentTime = kept[0]?.start ?? 0;
    play();
  }, [kept, play]);

  // During playback: update the track, skip cuts and loop at the end.
  const onTime = useCallback(() => {
    const element = video.current;
    if (element === null || element.paused) return;
    const at = playableMoment(kept, element.currentTime);
    if (at === null || element.ended) {
      element.currentTime = kept[0]?.start ?? 0;
      return;
    }
    if (Math.abs(at - element.currentTime) > 0.02) element.currentTime = at;
    if (playable > 0) setFraction(toPlayback(kept, at) / playable);
  }, [kept, playable]);

  const bind = {
    onPointerEnter(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerType !== 'mouse') return;
      hovered.current = true;
      movedAt.current = Date.now();
      window.clearTimeout(dwell.current);
      dwell.current = window.setTimeout(() => setActive(true), DWELL_MS);
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const box = surface.current?.getBoundingClientRect();
      if (event.pointerType !== 'mouse' || box === undefined || box.width === 0) return;
      across.current = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      movedAt.current = Date.now();
      if (!active || manifest === undefined) return;
      video.current?.pause();
      setFraction(across.current);
      // The very end has no decoded frame; keep the last frame visible while scrubbing there.
      seekTo(toLesson(kept, Math.min(across.current * playable, Math.max(0, playable - 0.02))));
      schedulePlay();
    },
    onPointerLeave: stop,
    onBlur: stop,
  };

  const chapter =
    fraction === null || manifest === undefined
      ? undefined
      : chapterAt(chapters, toLesson(kept, fraction * playable));

  const layer =
    active && lesson !== null ? (
      <>
        <video
          className="lessons-preview__video"
          data-ready={ready ? '' : undefined}
          muted
          onEnded={onEnded}
          onLoadedData={onLoaded}
          onSeeked={onSeeked}
          onTimeUpdate={onTime}
          playsInline
          preload="auto"
          ref={video}
          src={url || undefined}
        >
          <track kind="captions" />
        </video>
        {ready && fraction !== null && (
          <>
            <span aria-hidden="true" className="lessons-preview__track">
              <span className="lessons-preview__fill" style={{ width: `${fraction * 100}%` }} />
            </span>
            {chapter !== undefined && (
              <span className="lessons-preview__chapter lessons-glass">
                {chapter.index + 1} · {chapter.title}
              </span>
            )}
          </>
        )}
      </>
    ) : null;

  return { bind, layer, previewing: active && ready };
}
