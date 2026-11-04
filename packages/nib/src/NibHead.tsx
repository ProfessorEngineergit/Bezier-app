/**
 * Nib's live head and neck (the real model) in its own box. Creates its own stage (one WebGL
 * context, only while needed) and draws only when the stage asks. Until he is drawn, and where he
 * must stay static (no GPU, reduced motion), a rendered picture of the same head stands in.
 */

import { useEffect, useRef, useState } from 'react';
import type { HeadMood } from './head-mood.js';
import { type NibLook, NibStage } from './stage.js';

type HeadState = 'loading' | 'live' | 'picture';

export interface NibHeadProps {
  /** Model URL. */
  model: string;
  mood: HeadMood;
  /** False while the window is hidden or off screen: the stage is kept, the loop stops. */
  active: boolean;
  /** Reduced motion: stays static. */
  still: boolean;
  /**
   * Element he looks at instead of the pointer (e.g. a button in a lesson). A function, read a few
   * times a second, so it follows the element.
   */
  lookAt?: () => Element | null;
  /** Colours from the settings. */
  look?: NibLook;
}

/** The head rendered from the model, beside the model file. */
const PICTURE = 'nib-head.webp';

/** Pointer distance from his head, in pixels, within which he follows the pointer. */
const NEAR = 260;

export function NibHead({ model, mood, active, still, lookAt, look }: NibHeadProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<NibStage | null>(null);
  const [state, setState] = useState<HeadState>('loading');
  const latest = useRef({ mood, lookAt, look });
  latest.current = { mood, lookAt, look };

  // The stage: created once the box exists, disposed with it.
  useEffect(() => {
    const element = host.current;
    if (element === null || still) {
      setState('picture');
      return;
    }
    let cancelled = false;
    const canvas = document.createElement('canvas');
    // A canvas without a working context draws the browser's broken-picture mark over the picture.
    const givenUp = () => {
      canvas.remove();
      setState('picture');
    };
    canvas.addEventListener('webglcontextlost', givenUp, { once: true });
    element.append(canvas);
    setState('loading');
    NibStage.create(canvas, model, 'head')
      .then((made) => {
        if (made === null || cancelled) {
          made?.dispose();
          if (!cancelled) givenUp();
          return;
        }
        stage.current = made;
        // Use the box's layout size, not its on-screen size: the bubble animates in at a third of
        // its scale, and a canvas sized then would stay a third as sharp.
        made.resize(element.clientWidth, element.clientHeight, Math.min(devicePixelRatio, 2));
        made.setMood(latest.current.mood);
        made.setLook(latest.current.look ?? {});
        setState('live');
      })
      .catch(() => {
        if (!cancelled) givenUp();
      });
    const observer = new ResizeObserver(() => {
      stage.current?.resize(
        element.clientWidth,
        element.clientHeight,
        Math.min(devicePixelRatio, 2),
      );
    });
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
      stage.current?.dispose();
      stage.current = null;
      canvas.remove();
    };
  }, [model, still]);

  useEffect(() => {
    stage.current?.setMood(mood);
  }, [mood]);

  const body = look?.body;
  const eyes = look?.eyes;
  useEffect(() => {
    stage.current?.setLook({
      ...(body === undefined ? {} : { body }),
      ...(eyes === undefined ? {} : { eyes }),
    });
  }, [body, eyes]);

  // Animation loop while visible; he looks at the pointer.
  useEffect(() => {
    if (!active || still) return;
    let frame = 0;
    let following = false;
    let lastLook = 0;
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
      const now = ms / 1000;
      // Look at the target, re-read a few times a second.
      const target = latest.current.lookAt?.() ?? null;
      const element = host.current;
      if (target !== null && element !== null && now - lastLook > 0.2) {
        lastLook = now;
        const r = target.getBoundingClientRect();
        if (r.width > 0)
          stage.current?.pointerMove(
            r.left + r.width / 2,
            r.top + r.height / 2,
            element.getBoundingClientRect(),
            now,
          );
      }
      stage.current?.tick(now);
    };
    const onMove = (event: PointerEvent) => {
      const element = host.current;
      if (element === null || latest.current.lookAt?.()) return;
      const box = element.getBoundingClientRect();
      const near =
        Math.hypot(
          event.clientX - (box.left + box.width / 2),
          event.clientY - (box.top + box.height / 2),
        ) < NEAR;
      // Only nearby pointers; turning after every mouse move across the window is distracting.
      if (near) {
        following = true;
        stage.current?.pointerMove(event.clientX, event.clientY, box, performance.now() / 1000);
      } else if (following) {
        following = false;
        stage.current?.pointerLeft();
      }
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      frame = document.hidden ? 0 : requestAnimationFrame(tick);
    };
    if (!document.hidden) frame = requestAnimationFrame(tick);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, still]);

  return (
    <div aria-hidden="true" className="nib-head" data-head={state} ref={host}>
      <img alt="" draggable={false} src={model.replace(/[^/]+$/, PICTURE)} />
    </div>
  );
}
