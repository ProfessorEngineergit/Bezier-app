/**
 * Full-window intro film on first launch. Skip is shown but disabled the first time, enabled on
 * replay. No address, no network, or no playback within a few seconds closes it silently without
 * marking it seen, so it is retried on the next launch.
 */

import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FILM_DONE,
  filmSeen,
  filmSources,
  filmUrl,
  markFilmSeen,
  REPLAY_EVENT,
  servedFilm,
} from './film.js';
import './film.css';

/** How long a film may take to begin before it is given up on. */
const START_WITHIN_MS = 20_000;

/** Makes the window fullscreen for the film and restores it; only the desktop app has one. */
async function fullscreen(on: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setFullscreen(on);
  } catch {
    // The film plays in the window as it is.
  }
}

/** Seconds as m:ss, for the length shown beside the bar. */
function minutes(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The film's URL for the video element. The bundled file is read whole into a blob, because the
 * video element requests byte ranges and the app's file server does not answer them. Remote
 * URLs are used as they are.
 */
const MISSING = 'missing';

function useFilmSource(url: string | undefined, wanted: boolean): string | null {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (!wanted || url === undefined) return;
    let made: string | null = null;
    let current = true;
    if (!url.startsWith('/')) {
      setSource(url);
      return;
    }
    void fetch(url)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error('no film'))))
      .then((blob) => {
        if (!current) return;
        made = URL.createObjectURL(blob);
        setSource(made);
      })
      // Not in this build: try the next file.
      .catch(() => {
        if (current) setSource(MISSING);
      });
    return () => {
      current = false;
      if (made !== null) URL.revokeObjectURL(made);
      setSource(null);
    };
  }, [url, wanted]);
  return source;
}

export function FirstRunFilm() {
  const [playing, setPlaying] = useState<{ first: boolean } | null>(null);
  const [progress, setProgress] = useState(0);
  const [clock, setClock] = useState({ at: 0, length: 0 });
  const [needsPress, setNeedsPress] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const wentFullscreen = useRef(false);
  const sources = filmSources(filmUrl(), servedFilm());
  // Index of the file being tried; an error moves to the next.
  const [attempt, setAttempt] = useState(0);
  const source = useFilmSource(sources[attempt], playing !== null);

  const open = useCallback((first: boolean) => {
    if (filmUrl() === '') return;
    setAttempt(0);
    setProgress(0);
    setNeedsPress(false);
    setPlaying({ first });
  }, []);

  // First launch.
  useEffect(() => {
    if (!filmSeen()) open(true);
  }, [open]);

  useEffect(() => {
    const again = () => open(false);
    window.addEventListener(REPLAY_EVENT, again);
    return () => window.removeEventListener(REPLAY_EVENT, again);
  }, [open]);

  /** Seeks, clamped to the film's length. */
  const seek = useCallback((seconds: number) => {
    const element = video.current;
    if (element === null || !(element.duration > 0)) return;
    element.currentTime = Math.min(Math.max(0, seconds), element.duration);
  }, []);
  const seekTo = (event: React.PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const duration = video.current?.duration ?? 0;
    seek(((event.clientX - box.left) / box.width) * duration);
  };

  const close = useCallback(
    (finished: boolean) => {
      const first = playing?.first === true;
      setPlaying(null);
      if (wentFullscreen.current) {
        wentFullscreen.current = false;
        void fullscreen(false);
      }
      if (finished) {
        if (first) markFilmSeen();
        window.dispatchEvent(new Event(FILM_DONE));
      }
    },
    [playing],
  );

  useEffect(() => {
    if (playing === null) return;
    wentFullscreen.current = isTauri();
    void fullscreen(true);
    // The film did not start: close silently.
    const patience = window.setTimeout(() => {
      if ((video.current?.readyState ?? 0) < 3) close(false);
    }, START_WITHIN_MS);
    return () => window.clearTimeout(patience);
  }, [playing, close]);

  /** The current file cannot play: try the next, or close when none are left. */
  const tryNext = useCallback(
    (why: string) => {
      if (attempt + 1 < sources.length) {
        setAttempt(attempt + 1);
        return;
      }
      // For the report's process log: which system could play none of them.
      console.warn(`The film could not be played (${why})`);
      close(false);
    },
    [attempt, sources.length, close],
  );

  useEffect(() => {
    if (source === MISSING) tryNext('not in this build');
  }, [source, tryNext]);

  if (playing === null) return null;
  return (
    <div aria-label="Introduction film" aria-modal="true" className="film" role="dialog">
      {/* biome-ignore lint/a11y/useMediaCaption: the film has no speech; its sound is music */}
      <video
        className="film__video"
        onCanPlay={() => {
          void video.current?.play().catch(() => setNeedsPress(true));
        }}
        onEnded={() => close(true)}
        onError={(event) => tryNext(`media error ${String(event.currentTarget.error?.code)}`)}
        onTimeUpdate={(event) => {
          const { currentTime, duration } = event.currentTarget;
          if (duration > 0) {
            setProgress(currentTime / duration);
            setClock({ at: currentTime, length: duration });
          }
        }}
        playsInline
        preload="auto"
        ref={video}
        src={source === null || source === MISSING ? undefined : source}
      />
      {needsPress && (
        <button
          className="film__play"
          onClick={() => {
            setNeedsPress(false);
            void video.current?.play();
          }}
          type="button"
        >
          Play
        </button>
      )}
      <div className="film__bar">
        {/* The bar also seeks: click or drag anywhere, or use the arrow keys. */}
        <div
          aria-label="Position in the film"
          aria-valuemax={Math.round(clock.length)}
          aria-valuemin={0}
          aria-valuenow={Math.round(clock.at)}
          className="film__track"
          onKeyDown={(event) => {
            const step = event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0;
            if (step !== 0) {
              event.preventDefault();
              seek((video.current?.currentTime ?? 0) + step);
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seekTo(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons !== 0) seekTo(event);
          }}
          role="slider"
          tabIndex={0}
        >
          <span aria-hidden="true" className="film__rail">
            <span className="film__fill" style={{ transform: `scaleX(${progress})` }} />
          </span>
        </div>
        <span className="film__time">
          {minutes(clock.at)} / {minutes(clock.length)}
        </span>
        <button
          className="film__skip"
          disabled={playing.first}
          onClick={() => close(true)}
          title={playing.first ? 'Skipping opens once you have seen it' : 'Skip the film'}
          type="button"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
