/**
 * Dragging a project card to a folder. Not native drag and drop, whose drag image is a static
 * bitmap: a copy of the card shrinks to an icon under the pointer, shrinks further over a folder so
 * the drop slot stays visible, and glides back home if released elsewhere. Physics are in
 * `card-drag-physics.ts`, folder tracking in `card-drag-folders.ts`.
 */

import { FolderHover } from './card-drag-folders.js';
import {
  type Motion,
  pose,
  relax,
  type Size,
  type Swing,
  spring,
  swing,
  track,
  transformFor,
} from './card-drag-physics.js';

/** How far the pointer must travel before a press becomes a drag and not a click. */
const THRESHOLD = 5;
/** The carried icon's size, as a fraction of the card's picture. */
const CARRIED = 0.5;
/** Size over a folder that has not opened yet, clear of its name. */
const OVER_FOLDER = 0.34;
/** Rate at which the size and the pull into an open folder approach their targets, per second. */
const EASE_RATE = 16;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

export interface CardDragHandlers {
  /** How many projects go with this card: more than one shows as a stack with a count. */
  count: number;
  /**
   * Whether dropping on this folder (null for All Projects) moves the project. A folder that
   * already contains it still opens (`FolderDropTray.tsx`), but the drop sends the card home.
   */
  accepts: (folder: string | null) => boolean;
  onStart: () => void;
  /** The folder open for a drop: its id, null for All Projects, undefined for none. */
  onTarget: (folder: string | null | undefined) => void;
  /** Released over a folder. */
  onDrop: (folder: string | null) => void;
  /** Called when the drag ends, however it ended. */
  onEnd: () => void;
}

const reducedMotion = () => {
  const chosen = document.documentElement.dataset.motion;
  if (chosen === 'reduced') return true;
  if (chosen === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Watches a press on `tile`; a press that never moves past the threshold stays a click. Returns a
 * function that abandons the gesture.
 */
export function watchCardDrag(
  press: PointerEvent,
  tile: HTMLElement,
  handlers: CardDragHandlers,
): () => void {
  const face = tile.querySelector<HTMLElement>('.tile__face') ?? tile;
  const startX = press.clientX;
  const startY = press.clientY;
  const calm = reducedMotion();

  let state: 'pending' | 'carrying' | 'releasing' | 'over' = 'pending';
  let icon: HTMLElement | null = null;
  let home = face.getBoundingClientRect();
  let grabX = 0;
  let grabY = 0;
  let pointerX = startX;
  let pointerY = startY;
  let movedAt = press.timeStamp;
  let frame = 0;
  let lastFrame = 0;
  let scale = 1;
  /** The size on its spring; `scale` follows it. */
  const size: Size = { value: 1, speed: 0 };
  /** The swing from the grab point. */
  const hang: Swing = { angle: 0, spin: 0 };
  let lastVx = 0;
  /** 0 at the pointer, 1 settled into the open folder's slot. */
  let pull = 0;
  const motion: Motion = { vx: 0, vy: 0 };
  const folders = new FolderHover(handlers.onTarget);

  /**
   * Where the grab point goes: under the pointer, or pulled into an open folder's slot so the card
   * shows where it will land and the folder name stays readable.
   */
  const place = () => {
    const box = pull > 0.001 ? folders.landing() : null;
    if (box === null) return { x: pointerX, y: pointerY };
    const x = box.left + (box.width - home.width * scale) / 2 + grabX * scale;
    const y = box.top + (box.height - home.height * scale) / 2 + grabY * scale;
    return { x: pointerX + (x - pointerX) * pull, y: pointerY + (y - pointerY) * pull };
  };

  const render = () => {
    if (icon === null) return;
    const shape = calm ? { sx: scale, sy: scale, tilt: 0 } : pose(motion, hang, scale);
    // No lean once settled in a slot.
    shape.tilt *= 1 - pull;
    const at = place();
    icon.style.transform = transformFor(at.x, at.y, grabX, grabY, shape);
  };

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = lastFrame === 0 ? 1 / 60 : Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;
    // Pointer events stop when the pointer does; the lean still has to settle.
    if (performance.now() - movedAt > 30) relax(motion, dt);
    const landing = folders.landing();
    const inWell = landing !== null && landing.height > 1;
    const goal = inWell
      ? Math.min(landing.width / home.width, landing.height / home.height)
      : folders.hovered !== null
        ? OVER_FOLDER
        : CARRIED;
    const ease = 1 - Math.exp(-EASE_RATE * dt);
    if (calm) {
      scale = goal;
    } else {
      spring(size, goal, dt);
      scale = size.value;
      // Driven by the change in speed. Only while moving or just stopped: the smoothed speed decays
      // long after and would leave the card hanging crooked.
      const recent = performance.now() - movedAt < 150;
      const ax = dt > 0 && recent ? (motion.vx - lastVx) / dt : 0;
      swing(hang, inWell ? 0 : ax, dt);
    }
    lastVx = motion.vx;
    pull = calm ? Number(inWell) : pull + (Number(inWell) - pull) * ease;
    // Rows move under a still pointer as a folder opens or closes.
    folders.follow(pointerX, pointerY);
    render();
  };

  const lift = (pointerId: number) => {
    state = 'carrying';
    home = face.getBoundingClientRect();
    // Grab point clamped to the picture, so a card taken by its name still hangs from the pointer.
    grabX = Math.min(home.width, Math.max(0, startX - home.left));
    grabY = Math.min(home.height, Math.max(0, startY - home.top));
    icon = face.cloneNode(true) as HTMLElement;
    icon.classList.add('tile--carried');
    // The lesson marker is drawn by the card frame, which the copy does not have.
    if (tile.dataset.lesson !== undefined) icon.dataset.lesson = '';
    icon.removeAttribute('aria-label');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.width = `${home.width}px`;
    icon.style.height = `${home.height}px`;
    icon.style.transformOrigin = `${grabX}px ${grabY}px`;
    if (handlers.count > 1) {
      // Several projects: shown as a stack with a count.
      icon.classList.add('tile--stack');
      const badge = document.createElement('span');
      badge.className = 'tile__count';
      badge.textContent = String(handlers.count);
      icon.append(badge);
    }
    // Appended inside the start page, where its colours are defined.
    (tile.closest('.library') ?? document.body).append(icon);
    document.body.dataset.carrying = '';
    // Capture so the release arrives here even outside the window.
    try {
      tile.setPointerCapture(pointerId);
    } catch {
      // A pointer that is already gone ends in `lostpointercapture` below.
    }
    handlers.onStart();
    render();
    frame = requestAnimationFrame(tick);
  };

  const move = (event: PointerEvent) => {
    if (event.pointerId !== press.pointerId) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    track(motion, dx, dy, (event.timeStamp - movedAt) / 1000);
    pointerX = event.clientX;
    pointerY = event.clientY;
    movedAt = event.timeStamp;
    if (state === 'pending') {
      if (Math.hypot(pointerX - startX, pointerY - startY) < THRESHOLD) return;
      lift(event.pointerId);
    }
    if (state !== 'carrying') return;
    // Immediately, not on the next frame.
    render();
  };

  /** Animates the icon from where it is now, then cleans up. */
  const land = (keyframe: Keyframe, duration: number, done: () => void) => {
    // Abandoned while landing: the abandoning code has cleaned up.
    const then = () => {
      if (state === 'releasing') done();
    };
    const moving = icon;
    if (moving === null || calm) return then();
    const from = moving.style.transform;
    moving
      .animate([{ transform: from, opacity: 1 }, keyframe], {
        duration,
        easing: EASE_OUT,
        fill: 'forwards',
      })
      .finished.then(then, then);
  };

  const cleanUp = () => {
    cancelAnimationFrame(frame);
    folders.dispose();
    icon?.remove();
    icon = null;
    delete document.body.dataset.carrying;
    state = 'over';
  };

  const release = (event: PointerEvent) => {
    if (event.pointerId !== press.pointerId) return;
    detach();
    if (state !== 'carrying') {
      state = 'over';
      return;
    }
    state = 'releasing';
    cancelAnimationFrame(frame);
    // Swallow the click that follows a drag.
    const swallow = (click: Event) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

    // Use the release position: the folder under the pointer is otherwise looked up once per frame,
    // and a quick flick can release before the next frame.
    pointerX = event.clientX;
    pointerY = event.clientY;
    folders.follow(pointerX, pointerY);

    // Released over a folder that accepts it, open or about to open.
    const into = folders.open ?? folders.hovered;
    if (into === null || !handlers.accepts(into.id)) {
      goHome();
      return;
    }
    folders.setOpen(into);
    const landing = folders.landing();
    let to: { x: number; y: number };
    let size: number;
    if (landing !== null && landing.height > 1) {
      // Into the slot the folder kept for it.
      pull = 1;
      size = Math.min(landing.width / home.width, landing.height / home.height);
      scale = size;
      to = place();
    } else {
      // Released before the folder opened (or over All Projects): into the row.
      const at = into.element.getBoundingClientRect();
      size = scale * 0.4;
      to = {
        x: at.left + at.width / 2 - (home.width / 2 - grabX) * size,
        y: at.top + at.height / 2 - (home.height / 2 - grabY) * size,
      };
    }
    const intoPlace = landing !== null && landing.height > 1;
    land(
      {
        transform: transformFor(to.x, to.y, grabX, grabY, { sx: size, sy: size, tilt: 0 }),
        // Stays opaque into the slot: the folder shows the project there on drop (FolderDropTray's
        // `arriving`) and the icon is removed once that is on screen. Fading out caused a blink.
        opacity: intoPlace ? 1 : 0,
      },
      intoPlace ? 180 : 200,
      () => {
        handlers.onDrop(into.id);
        // Two frames: one to draw the project in its slot, one to present it.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (state === 'releasing') cleanUp();
          }),
        );
        // The folder stays open a moment with the project inside, then shuts.
        window.setTimeout(() => {
          handlers.onTarget(undefined);
          handlers.onEnd();
        }, 480);
      },
    );
  };

  const goHome = () => {
    folders.setOpen(null);
    const back = face.getBoundingClientRect();
    land(
      {
        transform: transformFor(back.left + grabX, back.top + grabY, grabX, grabY, {
          sx: 1,
          sy: 1,
          tilt: 0,
        }),
        opacity: 1,
      },
      300,
      () => {
        // The card on the page is restored first and the copy removed two frames later, so the
        // faded placeholder is never seen.
        handlers.onEnd();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (state === 'releasing') cleanUp();
          }),
        );
      },
    );
  };

  /** The gesture was interrupted (window lost focus, tile removed): send the card home. */
  const interrupted = () => {
    detach();
    if (state === 'carrying') {
      state = 'releasing';
      cancelAnimationFrame(frame);
      goHome();
    } else if (state === 'pending') {
      state = 'over';
    }
  };

  const keys = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || state !== 'carrying') return;
    event.stopPropagation();
    interrupted();
  };

  const lost = () => {
    if (state === 'carrying') interrupted();
  };

  const detach = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', interrupted);
    window.removeEventListener('blur', interrupted);
    window.removeEventListener('keydown', keys, { capture: true });
    tile.removeEventListener('lostpointercapture', lost);
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', interrupted);
  window.addEventListener('blur', interrupted);
  window.addEventListener('keydown', keys, { capture: true });
  tile.addEventListener('lostpointercapture', lost);

  return () => {
    detach();
    if (state === 'carrying' || state === 'releasing') {
      cleanUp();
      handlers.onTarget(undefined);
      handlers.onEnd();
    }
    state = 'over';
  };
}
