/**
 * Renders Nib: one fixed box positioned by the controller (on a page spot or in the corner), with
 * the figure (a static image first, the live stage when graphics allow), the speech bubble and the
 * target ring. Makes no decisions; it follows the controller and the pointer. While visible and
 * the tab is in front, one rAF loop positions the box, lets the controller poll the page, moves
 * bubble and ring, and ticks the stage.
 */

import './nib.css';
import { type MouseEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { NibController, Placement } from './controller.js';
import { type Box, bubbleBox, dockBox, grown, heightFor } from './layout.js';
import { NibBubble } from './NibBubble.js';
import { NibStage } from './stage.js';
import { resolve } from './target.js';

export interface NibCompanionProps {
  controller: NibController;
  model: string;
  poster: string;
  /** Reduced motion: show the static image only. */
  still: boolean;
  label: string;
}

type State = 'poster' | 'loading' | 'live';

const same = (a: Placement | null, b: Placement | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.kind === b.kind &&
    a.width === b.width &&
    (a.kind === 'dock' || (b.kind === 'spot' && a.element === b.element && a.frame === b.frame)));

/** Pointer distance in pixels within which he follows the pointer. */
const NEAR = 340;

/** Duration of the glide to a new position, in seconds. */
const GLIDE = 0.55;

export function NibCompanion({ controller, model, poster, still, label }: NibCompanionProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [placed, setPlaced] = useState<Placement | null>(null);
  const [state, setState] = useState<State>(still ? 'poster' : 'loading');
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const stage = useRef<NibStage | null>(null);
  const latest = useRef({ placed, snapshot });
  latest.current = { placed, snapshot };

  // Placement, re-evaluated a few times a second and on every controller change.
  useEffect(() => {
    const look = () =>
      setPlaced((before) =>
        same(before, controller.placement()) ? before : controller.placement(),
      );
    look();
    const timer = setInterval(look, 250);
    const stop = controller.subscribe(look);
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [controller]);

  // The stage is created on first use and kept for the page's lifetime; never with reduced motion.
  const wanted = placed !== null;
  useEffect(() => {
    const element = host.current;
    if (still || !wanted || element === null || stage.current !== null) {
      if (still) setState('poster');
      return;
    }
    let cancelled = false;
    const canvas = document.createElement('canvas');
    element.append(canvas);
    NibStage.create(canvas, model)
      .then((made) => {
        if (made === null || cancelled) {
          made?.dispose();
          if (!cancelled) setState('poster');
          return;
        }
        stage.current = made;
        controller.attach(made);
        setState('live');
      })
      .catch(() => {
        if (!cancelled) setState('poster');
      });
    return () => {
      cancelled = true;
      controller.attach(null);
      stage.current?.dispose();
      stage.current = null;
      canvas.remove();
    };
  }, [still, wanted, model, controller]);

  // Frame loop while visible.
  useEffect(() => {
    const node = root.current;
    if (node === null || !wanted) return;
    let frame = 0;
    let last: Placement | null = null;
    let lastBox: Box | null = null;
    let glideUntil = -Infinity;
    let arriveAt = Infinity;
    let width = 0;
    let height = 0;
    let ringElement: Element | null = null;
    let ringLook = -Infinity;

    const boxOf = (placement: Placement): Box => {
      if (placement.kind === 'dock')
        return dockBox({ width: innerWidth, height: innerHeight }, placement.width);
      const r = placement.element.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        width: placement.width,
        height: placement.frame === 'full' ? heightFor(placement.width) : placement.width,
      };
    };

    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
      const now = ms / 1000;
      const { placed: placement, snapshot: current } = latest.current;
      if (placement === null) return;
      // The spot's element may already be gone before the controller is told (polled a few times
      // a second). A detached element measures all zeros and would flash him in the top corner.
      if (placement.kind === 'spot' && !placement.element.isConnected) {
        node.style.visibility = 'hidden';
        setPlaced((before) => (before === placement ? controller.placement() : before));
        return;
      }
      node.style.visibility = '';
      const box = boxOf(placement);
      const shape = placement.kind === 'spot' ? placement.frame : 'full';
      // Cheap when unchanged; the stage may have been created after the box was marked.
      stage.current?.setFrame(shape);
      const moved = !same(last, placement);
      if (moved) {
        // New position: glide there and hop on arrival. On first appearance just fade in.
        node.style.transition =
          lastBox === null
            ? 'none'
            : `transform ${GLIDE}s cubic-bezier(.25,.9,.3,1), width ${GLIDE}s, height ${GLIDE}s`;
        glideUntil = lastBox === null ? -Infinity : now + GLIDE;
        arriveAt = lastBox === null ? Infinity : now + GLIDE;
        last = placement;
      }
      if (now >= glideUntil || moved) {
        node.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
        node.style.width = `${box.width}px`;
        node.style.height = `${box.height}px`;
        lastBox = box;
      }
      if (now >= glideUntil && node.style.transition !== 'none') node.style.transition = 'none';
      if (now >= arriveAt) {
        arriveAt = Infinity;
        controller.react('hop', now);
      }
      // Set both dimensions: a round window is square, a standing figure is not, and a canvas sized
      // for one would squash or crop the other.
      if (
        (Math.round(box.width) !== width || Math.round(box.height) !== height) &&
        stage.current !== null
      ) {
        width = Math.round(box.width);
        height = Math.round(box.height);
        stage.current.resize(width, height, Math.min(devicePixelRatio, 2));
      }
      controller.tick(now);
      stage.current?.tick(now);

      const shown = lastBox ?? box;
      const speech = bubble.current;
      if (speech !== null) {
        const place = bubbleBox(
          shown,
          { width: innerWidth, height: innerHeight },
          {
            width: speech.offsetWidth,
            height: speech.offsetHeight,
          },
        );
        speech.style.transform = `translate3d(${place.left}px, ${place.top}px, 0)`;
        speech.dataset.side = place.side;
      }
      const marker = ring.current;
      if (marker !== null) {
        if (now - ringLook > 0.25) {
          ringLook = now;
          ringElement = current.aim === null ? null : resolve(current.aim);
        }
        const r = ringElement?.getBoundingClientRect();
        if (r === undefined || r.width <= 0) marker.style.opacity = '0';
        else {
          const g = grown({ left: r.left, top: r.top, width: r.width, height: r.height }, 6);
          marker.style.transform = `translate3d(${g.left}px, ${g.top}px, 0)`;
          marker.style.width = `${g.width}px`;
          marker.style.height = `${g.height}px`;
          marker.style.opacity = '1';
        }
      }
    };
    const run = () => {
      if (frame === 0 && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const halt = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const visibility = () => (document.hidden ? halt() : run());
    let queued = false;
    let following = false;
    const onMove = (event: PointerEvent) => {
      if (queued || stage.current === null) return;
      queued = true;
      const { clientX, clientY } = event;
      requestAnimationFrame(() => {
        queued = false;
        const shownBox = node.getBoundingClientRect();
        // Only nearby pointers; turning after every mouse move across the window is distracting.
        const near =
          Math.hypot(
            clientX - (shownBox.left + shownBox.width / 2),
            clientY - (shownBox.top + shownBox.height / 2),
          ) < NEAR;
        if (near) {
          following = true;
          stage.current?.pointerMove(clientX, clientY, shownBox, performance.now() / 1000);
        } else if (following) {
          following = false;
          stage.current?.pointerLeft();
        }
      });
    };
    const onLeave = () => stage.current?.pointerLeft();
    run();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      halt();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [wanted, controller]);

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    const live = stage.current;
    if (live === null) return;
    const now = performance.now() / 1000;
    if (event.detail === 0) return live.click([], now);
    const rect = live.box();
    const chain = live.pick(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
    if (chain !== null) live.click(chain, now);
  };

  const close = () => (controller.guiding ? controller.stopGuide() : controller.hush());

  return (
    <>
      <div
        className="nib-companion"
        data-frame={placed?.kind === 'spot' ? placed.frame : 'full'}
        data-nib={state}
        data-where={placed?.kind ?? 'away'}
        hidden={placed === null}
        ref={root}
      >
        <button
          aria-label={label}
          className="nib-companion__button"
          onClick={onClick}
          type="button"
        >
          <img alt="" className="nib-companion__poster" draggable={false} src={poster} />
          <span className="nib-companion__stage" ref={host} />
        </button>
      </div>
      {snapshot.bubble !== null && placed !== null && (
        <NibBubble bubble={snapshot.bubble} onClose={close} ref={bubble} />
      )}
      {/* Only while he is drawn here; otherwise the title bar draws the ring (`AimRing`). */}
      <div
        aria-hidden="true"
        className="nib-ring"
        hidden={snapshot.aim === null || placed === null}
        ref={ring}
      />
    </>
  );
}
