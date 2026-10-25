/**
 * Thumbnail frames for the scrub bar hover and the chapter list. A hidden video, created on first
 * request, seeks only to the latest requested time; frames are cached in half-second steps.
 */

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface Frames {
  /** The cached frame at a lesson time, or null if not available yet. */
  look(lessonTime: number): string | null;
  /** Requests a frame; it arrives with a new `Frames` value. */
  ask(lessonTime: number): void;
}

const WIDTH = 240;
/** Cache granularity in seconds. */
const STEP = 0.5;
/** Maximum cached frames; each is a few kilobytes. */
const KEPT = 240;

const bin = (time: number) => Math.max(0, Math.round(time / STEP));

const FramesContext = createContext<Frames | null>(null);

/** Provides frames from a lesson's recording to its descendants. */
export function FramesProvider({
  viewport,
  children,
}: {
  viewport: Blob | undefined;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const cache = useRef(new Map<number, string>());
  const video = useRef<HTMLVideoElement | null>(null);
  const url = useRef('');
  const wanted = useRef<number | null>(null);
  const busy = useRef(false);
  const gone = useRef(false);

  useEffect(() => {
    gone.current = false;
    const frames = cache.current;
    return () => {
      gone.current = true;
      video.current?.removeAttribute('src');
      video.current?.load();
      video.current = null;
      if (url.current !== '') URL.revokeObjectURL(url.current);
      url.current = '';
      frames.clear();
    };
  }, []);

  // A new value on each arriving frame, so consumers re-render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is what makes the value new
  const value = useMemo<Frames>(() => {
    const once = (target: EventTarget, name: string) =>
      new Promise<void>((resolve) =>
        target.addEventListener(name, () => resolve(), { once: true }),
      );

    const open = async (): Promise<HTMLVideoElement | null> => {
      if (viewport === undefined) return null;
      if (video.current !== null) return video.current;
      const element = document.createElement('video');
      element.muted = true;
      element.playsInline = true;
      element.preload = 'auto';
      url.current = URL.createObjectURL(viewport);
      element.src = url.current;
      video.current = element;
      await once(element, 'loadeddata');
      return element;
    };

    const pump = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        while (wanted.current !== null && !gone.current) {
          const key = wanted.current;
          wanted.current = null;
          if (cache.current.has(key)) continue;
          const element = await open();
          if (element === null || gone.current) break;
          element.currentTime = key * STEP;
          await once(element, 'seeked');
          const canvas = document.createElement('canvas');
          canvas.width = WIDTH;
          canvas.height = Math.round(
            (WIDTH * (element.videoHeight || 10)) / (element.videoWidth || 16),
          );
          canvas.getContext('2d')?.drawImage(element, 0, 0, canvas.width, canvas.height);
          cache.current.set(key, canvas.toDataURL('image/jpeg', 0.62));
          if (cache.current.size > KEPT) {
            const oldest = cache.current.keys().next().value;
            if (oldest !== undefined) cache.current.delete(oldest);
          }
          if (!gone.current) setVersion((v) => v + 1);
        }
      } catch (problem) {
        console.warn('a frame could not be made', problem);
      } finally {
        busy.current = false;
      }
    };

    return {
      look: (lessonTime) => cache.current.get(bin(lessonTime)) ?? null,
      ask: (lessonTime) => {
        const key = bin(lessonTime);
        if (cache.current.has(key)) return;
        wanted.current = key;
        void pump();
      },
    };
  }, [viewport, version]);

  return <FramesContext.Provider value={value}>{children}</FramesContext.Provider>;
}

/** The nearest `Frames`, or null without a provider. */
export const useFrames = (): Frames | null => useContext(FramesContext);
