/**
 * Lesson playback. Owns the `<video>` and the camera video kept in sync with it, skips removed
 * stretches, stops after the last kept one and reports lesson time at frame rate while playing.
 */

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LessonManifest } from '../format/manifest.js';
import {
  type Chapter,
  chapterAt,
  chapters as chaptersOf,
  keptStretches,
  nextChapter,
  playableDuration,
  playableMoment,
  previousChapter,
  type Stretch,
  toPlayback,
} from '../format/timeline.js';

export interface PlaybackOptions {
  /** Lesson time to start from. */
  startAt?: number;
  /** Skip removed stretches during playback. */
  skipRemoved: boolean;
  /**
   * For the edit view: a seek may land inside a removed stretch and stays there until play is
   * pressed, which continues from the next kept stretch.
   */
  seekAnywhere?: boolean;
  onEnded?: () => void;
}

export interface Playback {
  video: RefObject<HTMLVideoElement | null>;
  camera: RefObject<HTMLVideoElement | null>;
  /** Lesson time. */
  time: number;
  playing: boolean;
  ended: boolean;
  rate: number;
  muted: boolean;
  repeat: boolean;
  kept: Stretch[];
  playable: number;
  chapters: Chapter[];
  current: Chapter | undefined;
  seek(lessonTime: number): void;
  seekBy(seconds: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  chapter(direction: 1 | -1): void;
  setRate(rate: number): void;
  toggleMute(): void;
  toggleRepeat(): void;
}

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Drift from a seek (about two frames) after which the pinned chapter is released. */
const PIN_HOLD = 0.07;

export function usePlayback(manifest: LessonManifest, options: PlaybackOptions): Playback {
  const video = useRef<HTMLVideoElement | null>(null);
  const camera = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const recording = video.current;
    const author = camera.current;
    return () => {
      recording?.pause();
      author?.pause();
    };
  }, []);
  const kept = useMemo<Stretch[]>(
    () => (options.skipRemoved ? keptStretches(manifest) : [{ start: 0, end: manifest.duration }]),
    [manifest, options.skipRemoved],
  );
  const playable = useMemo(() => playableDuration(kept), [kept]);
  const chapters = useMemo(() => chaptersOf(manifest, kept), [manifest, kept]);
  const [time, setTime] = useState(options.startAt ?? 0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [rate, setRateState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const repeatRef = useRef(false);
  const onEnded = useRef(options.onEnded);
  onEnded.current = options.onEnded;
  repeatRef.current = repeat;
  const startAt = useRef(options.startAt ?? 0);
  /**
   * The chapter a seek targeted, kept until the video moves on. A seek lands on the nearest frame,
   * often slightly before the chapter start, and chapters can be milliseconds apart, so the clock
   * alone cannot tell which one was chosen.
   */
  const pinned = useRef<{ chapter: Chapter | undefined; at: number } | null>(null);
  /** Play was requested before the video had a source; start once it has one. */
  const wantsPlay = useRef(false);

  const syncCamera = useCallback((t: number) => {
    const face = camera.current;
    if (face !== null && Math.abs(face.currentTime - t) > 0.3) face.currentTime = t;
  }, []);

  const seek = useCallback(
    (lessonTime: number) => {
      const element = video.current;
      const lastEnd = kept.at(-1)?.end ?? 0;
      const target = options.seekAnywhere
        ? Math.min(manifest.duration, Math.max(0, lessonTime))
        : (playableMoment(kept, Math.max(0, lessonTime)) ?? lastEnd);
      pinned.current = { chapter: chapterAt(chapters, target), at: target };
      if (element !== null) element.currentTime = target;
      syncCamera(target);
      setTime(target);
      setEnded(false);
    },
    [kept, chapters, syncCamera, options.seekAnywhere, manifest.duration],
  );

  /** Maps the video position through the cuts; runs at frame rate while playing. */
  const follow = useCallback(() => {
    const element = video.current;
    if (element === null) return;
    const t = element.currentTime;
    if (pinned.current !== null && Math.abs(t - pinned.current.at) > PIN_HOLD)
      pinned.current = null;
    const current = pinned.current?.chapter ?? chapterAt(chapters, t);
    const next = nextChapter(chapters, t);
    if (repeatRef.current && current !== undefined && next !== undefined && t >= next.time) {
      seek(current.time);
      return;
    }
    // In the edit view a paused video may sit inside a removed stretch; leave it there until play.
    // The media can end a few frames before the manifest duration (the recorder's last chunk is
    // cut short), so `ended` also counts as the end of the lesson below.
    if (options.seekAnywhere && element.paused && !element.ended) {
      setTime(t);
      return;
    }
    const target = element.ended ? null : playableMoment(kept, t);
    if (target === null) {
      if (repeatRef.current && current !== undefined) {
        seek(current.time);
        return;
      }
      element.pause();
      setTime(kept.at(-1)?.end ?? t);
      setEnded(true);
      onEnded.current?.();
      return;
    }
    if (Math.abs(target - t) > 0.01) {
      element.currentTime = target;
      syncCamera(target);
      setTime(target);
      return;
    }
    setTime(t);
  }, [chapters, kept, seek, syncCamera, options.seekAnywhere]);

  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    let frame = 0;
    const tick = () => {
      follow();
      frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
      void camera.current?.play().catch(() => undefined);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      camera.current?.pause();
      cancelAnimationFrame(frame);
      follow();
    };
    const onLoaded = () => {
      if (!wantsPlay.current) return;
      wantsPlay.current = false;
      void element.play().catch(() => undefined);
    };
    // MediaRecorder WebM files have no duration; the manifest provides it, and browsers can still
    // seek them by scanning. The start position applies only once, because this effect reruns on
    // every manifest change and must not jump back to it.
    const onMetadata = () => {
      if (startAt.current > 0) element.currentTime = startAt.current;
      startAt.current = 0;
    };
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);
    element.addEventListener('ended', follow);
    element.addEventListener('timeupdate', follow);
    element.addEventListener('loadedmetadata', onMetadata);
    element.addEventListener('loadeddata', onLoaded);
    // After a seek `loadeddata` does not fire again; `canplay` does.
    element.addEventListener('canplay', onLoaded);
    if (element.readyState >= 1) onMetadata();
    if (element.readyState >= 2) onLoaded();
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('play', onPlay);
      element.removeEventListener('pause', onPause);
      element.removeEventListener('ended', follow);
      element.removeEventListener('timeupdate', follow);
      element.removeEventListener('loadedmetadata', onMetadata);
      element.removeEventListener('loadeddata', onLoaded);
      element.removeEventListener('canplay', onLoaded);
    };
  }, [follow]);

  const play = useCallback(() => {
    const element = video.current;
    if (element === null) return;
    // Only wait when there is no source yet. During a seek the browser queues `play()` itself.
    if (element.currentSrc === '') {
      wantsPlay.current = true;
      return;
    }
    if (ended || playableMoment(kept, element.currentTime) === null) seek(kept[0]?.start ?? 0);
    void element.play().catch(() => undefined);
  }, [ended, kept, seek]);
  const pause = useCallback(() => {
    wantsPlay.current = false;
    video.current?.pause();
  }, []);
  const toggle = useCallback(() => {
    if (video.current?.paused === false || wantsPlay.current) pause();
    else play();
  }, [play, pause]);

  const current =
    pinned.current !== null && Math.abs(time - pinned.current.at) <= PIN_HOLD
      ? pinned.current.chapter
      : chapterAt(chapters, time);

  return {
    video,
    camera,
    time,
    playing,
    ended,
    rate,
    muted,
    repeat,
    kept,
    playable,
    chapters,
    current,
    seek,
    seekBy: (seconds) => {
      const now = time;
      seek(
        seconds < 0
          ? Math.max(0, now + seconds)
          : Math.min(kept.at(-1)?.end ?? now, toLessonAfter(kept, now, seconds)),
      );
    },
    play,
    pause,
    toggle,
    chapter: (direction) => {
      const target = direction > 0 ? nextChapter(chapters, time) : previousChapter(chapters, time);
      if (target !== undefined) seek(target.time);
    },
    setRate: (next) => {
      setRateState(next);
      if (video.current !== null) video.current.playbackRate = next;
      if (camera.current !== null) camera.current.playbackRate = next;
    },
    toggleMute: () => {
      setMuted((value) => {
        if (video.current !== null) video.current.muted = !value;
        return !value;
      });
    },
    toggleRepeat: () => setRepeat((value) => !value),
  };
}

/** The lesson time `seconds` of playback after `now`, skipping removed stretches. */
function toLessonAfter(kept: readonly Stretch[], now: number, seconds: number): number {
  const target = toPlayback(kept, now) + seconds;
  let before = 0;
  for (const stretch of kept) {
    const length = stretch.end - stretch.start;
    if (target <= before + length) return stretch.start + (target - before);
    before += length;
  }
  return kept.at(-1)?.end ?? now;
}
