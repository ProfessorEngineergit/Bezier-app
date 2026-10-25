/**
 * A reference image on a plane, with on-canvas handles and a numbers panel.
 *
 * Handle positions are set by an animation-frame loop, without React re-renders (like the move
 * gizmo). Drags are computed in the image plane (`sketchPoint`), previewed through
 * `previewReferenceImage`, and written on release as one history step with only the changed values.
 *
 *   Size: a corner scales about the opposite corner, keeping proportions (unless Shift is held or
 *         the panel's box is unticked); a side stretches one way.
 *   Crop: a side or corner crops at the image's own scale.
 *   The centre disc moves it; the circle above rotates it (Shift: 15° steps).
 */

import type { FeatureRecord } from '@bezier/core';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { changed, type ImageMode, ImagePanel } from './ImagePanel.js';
import { imageBasis } from './image/image-basis.js';
import {
  type Corner,
  cornerPoint,
  cropCorner,
  cropEdge,
  type Edge,
  edgePoint,
  move,
  type Placement,
  placementOf,
  placementParams,
  resizeCorner,
  resizeEdge,
  uncrop,
} from './image/placement.js';
import { useWheelThrough } from './use-wheel-through.js';
import type { ViewportHandle } from './Viewport.js';
import './image-editor.css';
import { setAttr, setStyle } from './dom-writes.js';

type HandleId = 'move' | 'rotate' | `corner-${Corner}` | `edge-${Edge}`;

const CORNERS: readonly Corner[] = ['nw', 'ne', 'se', 'sw'];
const EDGES: readonly Edge[] = ['n', 'e', 's', 'w'];
const CURSORS: Record<string, string> = {
  'corner-nw': 'nwse-resize',
  'corner-se': 'nwse-resize',
  'corner-ne': 'nesw-resize',
  'corner-sw': 'nesw-resize',
  'edge-n': 'ns-resize',
  'edge-s': 'ns-resize',
  'edge-e': 'ew-resize',
  'edge-w': 'ew-resize',
  move: 'grab',
  rotate: 'crosshair',
};
/** How far past the top edge, in pixels, the turn handle stands. */
const TURN_REACH = 30;
const SNAP = Math.PI / 12;

interface Drag {
  handle: HandleId;
  start: Placement;
  /** The pointer's and the handle's starting positions on the plane. */
  first: { u: number; v: number };
  grab: { u: number; v: number };
  pointer: number;
}

export function ImageEditor({
  feature,
  handleRef,
  onPatch,
  onClose,
}: {
  feature: FeatureRecord;
  handleRef: RefObject<ViewportHandle | null>;
  onPatch: (id: string, params: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ImageMode>('place');
  const [keepShape, setKeepShape] = useState(true);
  const placement = useMemo(() => placementOf(feature.params), [feature.params]);
  const basis = useMemo(() => imageBasis(feature.params), [feature.params]);

  // Read by the loop and handlers without re-rendering.
  const live = useRef({ placement, basis, mode, keepShape, id: feature.id, onPatch, onClose });
  live.current = { placement, basis, mode, keepShape, id: feature.id, onPatch, onClose };
  /** The placement shown during a drag; null when it matches the project. */
  const draft = useRef<Placement | null>(null);
  const drag = useRef<Drag | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const outline = useRef<SVGPolygonElement>(null);
  const whole = useRef<SVGPolygonElement>(null);
  const stem = useRef<SVGLineElement>(null);
  const handles = useRef(new Map<HandleId, HTMLElement>());
  const [dragging, setDragging] = useState(false);
  useWheelThrough(root);

  // The project caught up with the drag, or something else changed the image: drop the draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the parameters changing is the trigger
  useEffect(() => {
    draft.current = null;
  }, [feature.params]);

  // Position the handles every frame from the current camera.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const view = handleRef.current;
      const canvas = document.querySelector('canvas.viewport');
      const { basis: plane, mode: editing, keepShape: keeping } = live.current;
      const shown = draft.current ?? live.current.placement;
      if (view === null || canvas === null || plane === null) return;
      const box = canvas.getBoundingClientRect();
      const toScreen = (u: number, v: number) =>
        view.project(
          plane.origin.x + plane.xDirection.x * u + plane.yDirection.x * v,
          plane.origin.y + plane.xDirection.y * u + plane.yDirection.y * v,
          plane.origin.z + plane.xDirection.z * u + plane.yDirection.z * v,
        );
      const put = (id: HandleId, at: { x: number; y: number } | null, visible = true) => {
        const element = handles.current.get(id);
        if (element === undefined) return;
        if (at === null || !visible) {
          setStyle(element, 'visibility', 'hidden');
          return;
        }
        setStyle(element, 'visibility', 'visible');
        setStyle(
          element,
          'transform',
          `translate(${box.left + at.x}px,${box.top + at.y}px) translate(-50%,-50%)`,
        );
      };
      const ring = (target: Placement) => {
        const points = CORNERS.map((corner) => {
          const at = cornerPoint(target, corner);
          const screen = toScreen(at.u, at.v);
          return screen === null ? null : { x: box.left + screen.x, y: box.top + screen.y };
        });
        return points.every((point) => point !== null)
          ? points.map((point) => `${String(point?.x)},${String(point?.y)}`).join(' ')
          : '';
      };
      if (outline.current !== null) setAttr(outline.current, 'points', ring(shown));
      const cropped = Object.values(shown.crop).some((part) => part > 0);
      if (whole.current !== null)
        setAttr(whole.current, 'points', editing === 'crop' && cropped ? ring(uncrop(shown)) : '');

      const middle = toScreen(shown.x, shown.y);
      put('move', middle);
      for (const corner of CORNERS) {
        const at = cornerPoint(shown, corner);
        put(`corner-${corner}`, toScreen(at.u, at.v));
      }
      for (const edge of EDGES) {
        const at = edgePoint(shown, edge);
        put(`edge-${edge}`, toScreen(at.u, at.v), editing === 'crop' || !keeping);
      }
      // The rotate handle sits a fixed number of pixels past the middle of the top edge, away from
      // the image's on-screen centre.
      const top = edgePoint(shown, 'n');
      const topScreen = toScreen(top.u, top.v);
      let turn: { x: number; y: number } | null = null;
      if (middle !== null && topScreen !== null) {
        const dx = topScreen.x - middle.x;
        const dy = topScreen.y - middle.y;
        const length = Math.hypot(dx, dy) || 1;
        turn = {
          x: topScreen.x + (dx / length) * TURN_REACH,
          y: topScreen.y + (dy / length) * TURN_REACH,
        };
      }
      put('rotate', turn, editing === 'place');
      if (stem.current !== null) {
        if (turn !== null && topScreen !== null && editing === 'place') {
          setAttr(stem.current, 'x1', String(box.left + topScreen.x));
          setAttr(stem.current, 'y1', String(box.top + topScreen.y));
          setAttr(stem.current, 'x2', String(box.left + turn.x));
          setAttr(stem.current, 'y2', String(box.top + turn.y));
          setStyle(stem.current, 'visibility', 'visible');
        } else setStyle(stem.current, 'visibility', 'hidden');
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handleRef]);

  const canvasPoint = (event: { clientX: number; clientY: number }) => {
    const canvas = document.querySelector('canvas.viewport');
    const { basis: plane } = live.current;
    const view = handleRef.current;
    if (canvas === null || plane === null || view === null) return null;
    const box = canvas.getBoundingClientRect();
    return view.sketchPoint(event.clientX - box.left, event.clientY - box.top, plane);
  };

  const worked = (current: Drag, pointer: { u: number; v: number }, shift: boolean): Placement => {
    const { mode: editing, keepShape: keeping } = live.current;
    const { start } = current;
    // Keep the grab offset instead of snapping the handle's centre to the pointer.
    const at = {
      u: pointer.u + current.grab.u - current.first.u,
      v: pointer.v + current.grab.v - current.first.v,
    };
    if (current.handle === 'move')
      return move(start, pointer.u - current.first.u, pointer.v - current.first.v);
    if (current.handle === 'rotate') {
      let rotation = Math.atan2(pointer.v - start.y, pointer.u - start.x) - Math.PI / 2;
      if (shift) rotation = Math.round(rotation / SNAP) * SNAP;
      return { ...start, rotation };
    }
    if (current.handle.startsWith('corner-')) {
      const corner = current.handle.slice(7) as Corner;
      return editing === 'crop'
        ? cropCorner(start, corner, at)
        : resizeCorner(start, corner, at, keeping !== shift);
    }
    const edge = current.handle.slice(5) as Edge;
    return editing === 'crop' ? cropEdge(start, edge, at) : resizeEdge(start, edge, at);
  };

  const begin = (handle: HandleId, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || drag.current !== null) return;
    const first = canvasPoint(event);
    if (first === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = draft.current ?? live.current.placement;
    const grab = handle.startsWith('corner-')
      ? cornerPoint(start, handle.slice(7) as Corner)
      : handle.startsWith('edge-')
        ? edgePoint(start, handle.slice(5) as Edge)
        : { u: start.x, v: start.y };
    drag.current = { handle, start, first, grab, pointer: event.pointerId };
    setDragging(true);
  };

  const move_ = (event: React.PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (current === null || event.pointerId !== current.pointer) return;
    const pointer = canvasPoint(event);
    if (pointer === null) return;
    const next = worked(current, pointer, event.shiftKey);
    draft.current = next;
    handleRef.current?.images.preview(live.current.id, next);
  };

  const end = (event: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const current = drag.current;
    if (current === null || event.pointerId !== current.pointer) return;
    drag.current = null;
    setDragging(false);
    const next = draft.current;
    const before = placementParams(current.start);
    const patch = next === null || !commit ? {} : changed(before, placementParams(next));
    if (Object.keys(patch).length === 0) {
      // Nothing to write: revert to the project's placement.
      draft.current = null;
      handleRef.current?.images.preview(live.current.id, live.current.placement);
      return;
    }
    // Keep the drag's placement until the project has the new values.
    live.current.onPatch(live.current.id, patch);
  };

  // Escape cancels a drag, or ends editing when there is none.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.target instanceof HTMLInputElement) return;
      if (drag.current !== null) {
        drag.current = null;
        draft.current = null;
        setDragging(false);
        handleRef.current?.images.preview(live.current.id, live.current.placement);
      } else live.current.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRef]);

  // Two-finger trackpad rotation rotates the image. Only WebKit (the Mac app's webview) reports it,
  // as `gesture*` events with the clockwise angle in degrees since the fingers went down.
  useEffect(() => {
    let start: Placement | null = null;
    const turned = (event: Event): number =>
      (event as unknown as { rotation?: number }).rotation ?? 0;
    const onStart = (event: Event) => {
      start = live.current.placement;
      event.preventDefault();
    };
    const onChange = (event: Event) => {
      if (start === null) return;
      event.preventDefault();
      const next = { ...start, rotation: start.rotation - (turned(event) * Math.PI) / 180 };
      draft.current = next;
      handleRef.current?.images.preview(live.current.id, next);
    };
    const onEnd = (event: Event) => {
      const from = start;
      start = null;
      if (from === null) return;
      event.preventDefault();
      const patch = changed(placementParams(from), placementParams(draft.current ?? from));
      if (Object.keys(patch).length === 0) {
        draft.current = null;
        handleRef.current?.images.preview(live.current.id, live.current.placement);
        return;
      }
      live.current.onPatch(live.current.id, patch);
    };
    window.addEventListener('gesturestart', onStart);
    window.addEventListener('gesturechange', onChange);
    window.addEventListener('gestureend', onEnd);
    return () => {
      window.removeEventListener('gesturestart', onStart);
      window.removeEventListener('gesturechange', onChange);
      window.removeEventListener('gestureend', onEnd);
    };
  }, [handleRef]);

  // Clear the handle preview from the viewport on unmount.
  useEffect(
    () => () => {
      draft.current = null;
    },
    [],
  );

  const grip = (id: HandleId, className: string, label: string) => (
    <button
      aria-label={label}
      className={`image-handle ${className}`}
      data-handle={id}
      key={id}
      onLostPointerCapture={(event) => end(event, false)}
      onPointerCancel={(event) => end(event, false)}
      onPointerDown={(event) => begin(id, event)}
      onPointerMove={move_}
      onPointerUp={(event) => end(event, true)}
      ref={(element) => {
        if (element === null) handles.current.delete(id);
        else handles.current.set(id, element);
      }}
      style={{ cursor: CURSORS[id] ?? 'default', visibility: 'hidden' }}
      type="button"
    />
  );

  return (
    <>
      <div className="image-editor" data-dragging={dragging ? '' : undefined} ref={root}>
        <svg aria-hidden="true" className="image-editor__lines">
          <polygon className="image-editor__whole" ref={whole} />
          <polygon className="image-editor__outline" ref={outline} />
          <line className="image-editor__stem" ref={stem} />
        </svg>
        {EDGES.map((edge) =>
          grip(`edge-${edge}`, 'image-handle--edge', `Edge ${edge.toUpperCase()}`),
        )}
        {CORNERS.map((corner) =>
          grip(`corner-${corner}`, 'image-handle--corner', `Corner ${corner.toUpperCase()}`),
        )}
        {grip('rotate', 'image-handle--turn', 'Turn the picture')}
        {grip('move', 'image-handle--move', 'Move the picture')}
      </div>
      <ImagePanel
        feature={feature}
        keepShape={keepShape}
        mode={mode}
        onClose={onClose}
        onKeepShape={setKeepShape}
        onMode={setMode}
        onOpacity={(opacity) =>
          handleRef.current?.images.preview(feature.id, draft.current ?? placement, opacity)
        }
        onPatch={(params) => onPatch(feature.id, params)}
      />
    </>
  );
}
