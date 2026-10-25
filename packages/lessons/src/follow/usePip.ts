/**
 * Position, size and dragging for the follow panel. The position is stored in localStorage as
 * fractions of the free area (`pip-math.ts`). While dragged the panel snaps to edges and the centre
 * line, then settles with a short spring on release; holding Alt disables snapping.
 *
 * Only the width is chosen; the height follows the content. The panel is not scaled as a whole:
 * the picture grows while the header and transport keep their normal size.
 */

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  clampTo,
  fromFractions,
  heightFor,
  KEEPOUT,
  type Keepout,
  magnetise,
  type PanelShape,
  type Point,
  type ResizeCorner,
  resizeOrigin,
  roomFor,
  type Size,
  type Stuck,
  toFractions,
  widthLimits,
} from './pip-math.js';

export type PipSize = 'small' | 'large';

const KEY = 'bezier.lessons.pip';
const NONE: Stuck = { left: false, right: false, top: false, bottom: false, centre: false };

interface Saved {
  size: PipSize;
  x: number;
  y: number;
  width?: number;
}

function read(): Saved {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw !== null && typeof raw === 'object') {
      const { size, x, y, width } = raw as Partial<Saved>;
      if (
        (size === 'small' || size === 'large') &&
        typeof x === 'number' &&
        typeof y === 'number'
      ) {
        return {
          size,
          x: Math.min(1, Math.max(0, x)),
          y: Math.min(1, Math.max(0, y)),
          ...(typeof width === 'number' && Number.isFinite(width) ? { width } : {}),
        };
      }
    }
  } catch {
    // Unreadable or unavailable storage: use the default below.
  }
  return { size: 'small', x: 1, y: 1 };
}

function write(saved: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage unavailable; the position is just not remembered.
  }
}

/** The panel width for each size, given the overlay size. */
export function pipWidth(size: PipSize, container: Size): number {
  if (size === 'small') return Math.min(340, Math.max(240, container.width - 160));
  return Math.min(960, Math.max(420, Math.round(container.width * 0.62)), container.width - 160);
}

const measure = (element: Element): Size => {
  const box = element.getBoundingClientRect();
  return { width: box.width, height: box.height };
};

export function usePip(
  panel: RefObject<HTMLElement | null>,
  content: RefObject<HTMLDivElement | null>,
) {
  const [saved, setSaved] = useState(read);
  const [container, setContainer] = useState<Size>({ width: 1440, height: 900 });
  const [height, setHeight] = useState(320);
  const [shape, setShape] = useState<PanelShape | null>(null);
  const [keepout, setKeepout] = useState<Keepout>(KEEPOUT);
  const [cube, setCube] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const [sizing, setSizing] = useState<{
    width: number;
    at: Point;
    before: Size;
    corner: ResizeCorner;
  } | null>(null);
  const [carried, setCarried] = useState<{ at: Point; stuck: Stuck } | null>(null);
  const [settling, setSettling] = useState(false);
  const settle = useRef(0);

  const limits = widthLimits(saved.size, container, keepout, shape);
  const width = Math.min(
    limits.most,
    Math.max(limits.least, sizing?.width ?? saved.width ?? pipWidth(saved.size, container)),
  );
  const own = useMemo(() => ({ width, height }), [width, height]);
  /** The predicted size at a width, before layout. */
  const sizeAt = (wide: number): Size => ({
    width: wide,
    height: shape === null ? (height / width) * wide : heightFor(shape, wide),
  });

  // Measure a size change before painting its new anchor position.
  // biome-ignore lint/correctness/useExhaustiveDependencies: size and width change the measured DOM, not the effect body
  useLayoutEffect(() => {
    const element = panel.current;
    const room = element?.closest('[data-lessons-overlay]');
    if (element === null || element === undefined || room === null || room === undefined) return;
    const update = () => {
      const bounds = room.getBoundingClientRect();
      const measured = measure(room);
      setContainer((old) =>
        old.width === measured.width && old.height === measured.height ? old : measured,
      );
      // Layout sizes, unaffected by the CSS scale applied while dragging.
      setHeight(element.offsetHeight);
      const picture = element.querySelector<HTMLElement>('.lessons-follow__tiles');
      if (picture !== null && picture.offsetWidth > 0 && picture.offsetHeight > 0) {
        const next = {
          ratio: picture.offsetHeight / picture.offsetWidth,
          inset: element.offsetWidth - picture.offsetWidth,
          extra: element.offsetHeight - picture.offsetHeight,
        };
        setShape((old) =>
          old !== null &&
          Math.abs(old.ratio - next.ratio) < 0.002 &&
          old.inset === next.inset &&
          old.extra === next.extra
            ? old
            : next,
        );
      }
      const stage = room.closest('.stage');
      const sidebar = stage?.querySelector('.items-panel');
      const left = sidebar ? sidebar.getBoundingClientRect().right - bounds.left + 12 : 12;
      setKeepout((old) => (old.left === left ? old : { ...KEEPOUT, left }));
      if (sidebar) observer.observe(sidebar);
      const compass = stage?.querySelector('.viewcube')?.getBoundingClientRect();
      setCube(
        compass
          ? {
              x: compass.left - bounds.left,
              y: compass.top - bounds.top,
              width: compass.width,
              height: compass.height,
            }
          : null,
      );
    };
    const observer = new ResizeObserver(update);
    update();
    observer.observe(room);
    if (content.current) observer.observe(content.current);
    observer.observe(element);
    const changes = new MutationObserver(update);
    const stage = room.closest('.stage');
    if (stage)
      changes.observe(stage, { attributes: true, attributeFilter: ['data-left-panel', 'style'] });
    return () => {
      observer.disconnect();
      changes.disconnect();
    };
  }, [panel, content, saved.size]);

  const room = roomFor(container, own, keepout);
  // Extra snap height just below the view cube.
  const rests = useMemo(() => (cube === null ? [] : [cube.y + cube.height + 12]), [cube]);
  const resting = fromFractions(room, saved);
  const at =
    carried?.at ??
    (sizing === null
      ? resting
      : clampTo(room, resizeOrigin(sizing.at, sizing.before, own, sizing.corner)));
  const stuck = carried?.stuck ?? magnetise(room, own, container, resting, 1).stuck;

  const carry = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = event.target as Element;
      if (
        event.button !== 0 ||
        (target.closest('button, input, a') !== null &&
          target.closest('.lessons-follow__grip') === null)
      ) {
        return;
      }
      const handle = event.currentTarget;
      const from = { x: event.clientX, y: event.clientY };
      const start = at;
      const id = event.pointerId;
      handle.setPointerCapture(id);
      window.clearTimeout(settle.current);
      setSettling(false);
      let last: { at: Point; stuck: Stuck } = { at: start, stuck };
      let moving = false;
      const move = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        // Movement under 4 px is a click (or half of a double click), not a drag.
        if (!moving && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4) return;
        moving = true;
        const wanted = { x: start.x + e.clientX - from.x, y: start.y + e.clientY - from.y };
        last = e.altKey
          ? { at: fromFractions(room, toFractions(room, wanted)), stuck: NONE }
          : magnetise(room, own, container, wanted, undefined, rests);
        setCarried(last);
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
        if (!moving) return;
        const fractions = toFractions(room, last.at);
        const next = { ...saved, x: fractions.x, y: fractions.y };
        setSaved(next);
        write(next);
        setCarried(null);
        // Animate the final snap with a spring.
        setSettling(true);
        settle.current = window.setTimeout(() => setSettling(false), 460);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    },
    [at, stuck, room, own, container, saved, rests],
  );

  useEffect(() => () => window.clearTimeout(settle.current), []);

  /** Moves the panel by an arrow-key step, with the same snapping. */
  const nudge = useCallback(
    (dx: number, dy: number) => {
      const { at: next } = magnetise(
        room,
        own,
        container,
        { x: at.x + dx, y: at.y + dy },
        undefined,
        rests,
      );
      const fractions = toFractions(room, next);
      const moved = { ...saved, x: fractions.x, y: fractions.y };
      setSaved(moved);
      write(moved);
      setSettling(true);
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => setSettling(false), 460);
    },
    [at, room, own, container, saved, rests],
  );

  const setSize = useCallback((size: PipSize) => {
    setSaved((was) => {
      const next = { size, x: was.x, y: was.y };
      write(next);
      return next;
    });
  }, []);

  // A native non-passive listener keeps trackpad pinches inside the video, away from CAD zoom.
  // Reattached every render so it reads the current position and limits.
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const zoom = (event: WheelEvent) => {
      if ((event.target as Element).closest('.lessons-controls, .lessons-follow__head, input'))
        return;
      event.preventDefault();
      event.stopPropagation();
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? own.height : 1);
      const nextWidth = Math.min(
        limits.most,
        Math.max(limits.least, width * Math.exp(-delta * 0.003)),
      );
      const after = sizeAt(nextWidth);
      const fractions = toFractions(roomFor(container, after, keepout), {
        x: at.x + (own.width - after.width) * saved.x,
        y: at.y + (own.height - after.height) * saved.y,
      });
      const next = { ...saved, width: nextWidth, ...fractions };
      setSaved(next);
      write(next);
    };
    element.addEventListener('wheel', zoom, { passive: false });
    return () => element.removeEventListener('wheel', zoom);
  });
  const resize = (event: ReactPointerEvent<HTMLElement>, corner: ResizeCorner) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY };
    const start = { ...at };
    const before = { ...own };
    // The dragged corner may not pass the room's edge on its side.
    const reach = corner.endsWith('left')
      ? start.x + own.width - keepout.left
      : container.width - keepout.right - start.x;
    const maximum = Math.min(limits.most, reach);
    let lastWidth = width;
    window.clearTimeout(settle.current);
    setSettling(false);
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      // Width follows the horizontal pointer movement; height follows width.
      const dx = (e.clientX - origin.x) * (corner.endsWith('left') ? -1 : 1);
      lastWidth = Math.min(maximum, Math.max(limits.least, width + dx));
      setSizing({ width: lastWidth, at: start, before, corner });
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      if (e.type !== 'pointercancel') {
        const after = sizeAt(lastWidth);
        const fractions = toFractions(
          roomFor(container, after, keepout),
          resizeOrigin(start, before, after, corner),
        );
        const next = { ...saved, width: lastWidth, ...fractions };
        setSaved(next);
        write(next);
      }
      setSizing(null);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  return {
    resize,
    size: saved.size,
    setSize,
    toggleSize: () => setSize(saved.size === 'small' ? 'large' : 'small'),
    carrying: carried !== null,
    settling,
    stuck,
    carry,
    nudge,
    width,
    cubeOverlap:
      cube !== null &&
      at.x < cube.x + cube.width &&
      at.x + own.width > cube.x &&
      at.y < cube.y + cube.height &&
      at.y + own.height > cube.y,
    place: `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0)`,
  };
}
