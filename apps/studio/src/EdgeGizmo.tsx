/**
 * The on-canvas control for rounding or bevelling a picked edge.
 *
 * The clicked world point is projected to the canvas every frame, and the arrow re-orients from the
 * edge tangent and the solid's outward direction, so the gizmo stays attached as the view orbits.
 *
 * Dragging the handle away from the edge fillets it; pushing back through the edge chamfers it.
 * The pill shows which is active and can force either. Sizes read 'R2.5 mm' for a radius and
 * '2.5 mm' for a setback.
 *
 * No bias dial or corner-style settings: the kernel cannot build asymmetric chamfers or corner
 * styles.
 */

/// <reference lib="dom" />

import type { EdgeFrame } from '@bezier/renderer';
import { useEffect, useRef, useState } from 'react';
import { px, setAttr, setStyle } from './dom-writes.js';
import { GizmoArrow } from './GizmoArrow.js';
import { useEdgeNumber } from './use-edge-number.js';
import { useGizmoAnchor } from './use-gizmo-anchor.js';
import type { ViewportHandle } from './Viewport.js';
import { projectWorldArrow, worldEdgeArrow } from './world-edge-arrow.js';

export type EdgeOp = 'fillet' | 'chamfer';

export interface EdgeGizmoProps {
  initialKind?: EdgeOp;
  initialSize?: number;
  lockKind?: boolean;
  /** The clicked point on the edge, in world millimetres. */
  anchor: { x: number; y: number; z: number };
  /** Which way the edge runs and which way is out of the solid, in world space. */
  frame: EdgeFrame | null;
  handleRef: React.RefObject<ViewportHandle | null>;
  onApply: (kind: EdgeOp, size: number) => void;
  /** Called on every drag tick for a live preview; does not commit. */
  onPreview?: (kind: EdgeOp, size: number) => void;
  /** Called when the gizmo should go away without committing. */
  onDismiss?: () => void;
}

/** Initial value for the mm-per-pixel ref before the first frame measures the camera. */
const MM_PER_PIXEL_FALLBACK = 0.06;
/** How far the handle sits from the edge, in pixels. */
const HANDLE_REACH = 14;
/** How far the pill sits from the edge, in pixels: past the handle, never under it. */
const BAR_REACH = 62;
/**
 * How far the orientation is probed, as a fraction of the distance to the eye. A fixed distance
 * (2 mm) projected to under a pixel when zoomed out, so the direction fell back to "rightward".
 * A fraction of the view distance projects to about the same pixels at any zoom, keeping the probe
 * both local and measurable.
 */
const PROBE_FRACTION = 0.02;

/** Screen-space direction the arrow points, and drags are measured along. */
type ScreenDir = { x: number; y: number };

/** Rightward, matching the icon's drawn orientation; the default before a frame exists. */
const DEFAULT_DIR: ScreenDir = { x: 1, y: 0 };

export function EdgeGizmo({
  initialKind = 'fillet',
  initialSize = 0,
  lockKind = false,
  anchor,
  frame,
  handleRef,
  onApply,
  onPreview,
  onDismiss,
}: EdgeGizmoProps) {
  const placement = useGizmoAnchor(handleRef);
  const sourceAnchor = anchor;
  const placedAnchor = useRef({ ...anchor });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleElRef = useRef<HTMLButtonElement | null>(null);
  const barElRef = useRef<HTMLDivElement | null>(null);
  const [kind, setKind] = useState<EdgeOp>(initialKind);
  const [size, setSize] = useState(initialSize);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  /** Set on handle press. `from` is the signed offset the drag started at. */
  const drag = useRef<{ x: number; y: number; from: number } | null>(null);
  /** Read inside listeners registered once, so they always see the current mode. */
  const kindRef = useRef(kind);
  kindRef.current = kind;
  /**
   * The size as of the last drag tick, read on release. Not read via `setSize`'s functional
   * updater: updaters must be pure, and committing inside one runs twice under StrictMode,
   * creating two features.
   */
  const lastSize = useRef(0);
  /** The outward screen direction, refreshed every frame and read by a drag. */
  const outward = useRef<ScreenDir>(DEFAULT_DIR);
  const worldArrow = useRef<ReturnType<typeof worldEdgeArrow>>(null);
  /** The span the cached arrow was built for, so a changed view can rebuild it. */
  const arrowSpan = useRef(0);
  /**
   * World millimetres per screen pixel, refreshed every frame from the camera and the anchor's
   * distance, so a drag reports the size under the cursor at the current zoom.
   */
  const mmPerPixel = useRef(MM_PER_PIXEL_FALLBACK);
  const number = useEdgeNumber({
    size,
    onStart: () => {
      drag.current = null;
      setDragging(false);
      setMenuOpen(false);
    },
    onPreview: (value) => {
      setSize(value);
      lastSize.current = value;
      onPreview?.(kindRef.current, value);
    },
    onCommit: (value) => {
      setSize(value);
      lastSize.current = value;
      if (value > 0 || lockKind) onApply(kindRef.current, value);
    },
  });

  // Keep the gizmo over its edge and its arrow pointing out of the solid. Projecting every frame,
  // not on camera events, stays exact through the damped glide; it costs two matrix transforms.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const root = rootRef.current;
      const handle = handleRef.current;
      const offset = placement.offset.current;
      const anchor = placedAnchor.current;
      const moved =
        anchor.x !== sourceAnchor.x + offset.x ||
        anchor.y !== sourceAnchor.y + offset.y ||
        anchor.z !== sourceAnchor.z + offset.z;
      anchor.x = sourceAnchor.x + offset.x;
      anchor.y = sourceAnchor.y + offset.y;
      anchor.z = sourceAnchor.z + offset.z;
      const at = handle?.project(anchor.x, anchor.y, anchor.z) ?? null;
      if (root === null) return;
      if (at === null || handle === null) {
        // Behind the camera: hide instead of pinning to a stale spot.
        setStyle(root, 'visibility', 'hidden');
        return;
      }
      setStyle(root, 'visibility', 'visible');
      setStyle(root, 'left', px(at.x));
      setStyle(root, 'top', px(at.y));

      const eye = handle.cameraPosition();
      const distance = Math.hypot(eye.x - anchor.x, eye.y - anchor.y, eye.z - anchor.z);
      mmPerPixel.current = handle.worldPerPixelAt(distance);

      if (frame !== null) {
        // The arrow is sized as a fraction of the view distance, so it is rebuilt when the
        // distance changes by more than 4%, keeping it constant on screen without rebuilding
        // on every orbit frame.
        const span = Math.max(0.01, distance * 0.025);
        if (
          moved ||
          worldArrow.current === null ||
          Math.abs(span - arrowSpan.current) > arrowSpan.current * 0.04
        ) {
          arrowSpan.current = span;
          worldArrow.current = worldEdgeArrow({ ...frame, snap: anchor }, span);
        }
      }
      const geometry = worldArrow.current;
      if (geometry !== null) {
        const centre = handle.project(geometry.centre.x, geometry.centre.y, geometry.centre.z);
        const label = handle.project(geometry.label.x, geometry.label.y, geometry.label.z);
        const button = handleElRef.current;
        if (centre !== null && button !== null) {
          const origin = { x: centre.x - 20, y: centre.y - 13 };
          const path = projectWorldArrow(handle, geometry.vertices, origin);
          setStyle(button, 'width', '40px');
          setStyle(
            button,
            'transform',
            `translate(${centre.x - at.x}px, ${centre.y - at.y}px) translate(-50%, -50%)`,
          );
          const svg = button.querySelector('svg');
          if (svg) setStyle(svg, 'left', '0px');
          for (const stroke of button.querySelectorAll('path')) setAttr(stroke, 'd', path ?? '');
          const dx = centre.x - at.x;
          const dy = centre.y - at.y;
          const length = Math.hypot(dx, dy);
          if (drag.current === null && length > 1)
            outward.current = { x: dx / length, y: dy / length };
        }
        if (label !== null && barElRef.current !== null) {
          const dir = outward.current;
          const clearance = (Math.abs(dir.x) * barElRef.current.offsetWidth) / 2 + 20;
          setStyle(
            barElRef.current,
            'transform',
            `translate(${px(label.x - at.x + dir.x * clearance)}, ${px(label.y - at.y + dir.y * clearance)}) translate(-50%, -50%)`,
          );
        }
        return;
      }

      const dir =
        drag.current === null ? screenOutward(handle, anchor, frame, at) : outward.current;
      outward.current = dir;
      const angleDeg = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;

      const handleEl = handleElRef.current;
      if (handleEl !== null) {
        setStyle(
          handleEl,
          'transform',
          `translate(${dir.x * HANDLE_REACH}px, ${dir.y * HANDLE_REACH}px) ` +
            'translate(-50%, -50%) ' +
            `rotate(${angleDeg}deg)`,
        );
      }
      const barEl = barElRef.current;
      if (barEl !== null) {
        // Offset the same way but never rotated, so the digits stay upright.
        const reach = BAR_REACH + (Math.abs(dir.x) * barEl.offsetWidth) / 2;
        setStyle(
          barEl,
          'transform',
          `translate(${px(dir.x * reach)}, ${px(dir.y * reach)}) translate(-50%, -50%)`,
        );
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sourceAnchor, frame, handleRef, placement.offset]);

  // Listen on the window so a fast drag that leaves the small handle keeps tracking.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const state = drag.current;
      if (state === null) return;

      // Measured along the arrow's direction, not along X, so dragging follows the arrow.
      const dir = outward.current;
      const along = (event.clientX - state.x) * dir.x + (event.clientY - state.y) * dir.y;

      // Signed: the side of the edge picks the operation and the distance picks the size. Crossing
      // zero switches between fillet and chamfer.
      const offset = state.from + along * mmPerPixel.current;
      const next = round(Math.abs(offset));
      const wanted: EdgeOp = lockKind ? initialKind : offset < 0 ? 'chamfer' : 'fillet';
      if (wanted !== kindRef.current) setKind(wanted);
      setSize(next);
      lastSize.current = next;
      if (next > 0) onPreview?.(wanted, next);
    };

    const onUp = () => {
      if (drag.current === null) return;
      drag.current = null;
      setDragging(false);
      // Commit once on release, from the ref onMove kept current. Called here, not inside a state
      // updater, so it never runs during a render.
      if (lastSize.current > 0 || lockKind) onApply(kindRef.current, lastSize.current);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [onApply, onPreview, initialKind, lockKind]);

  // Escape cancels without committing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      onDismiss?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, onDismiss]);

  const label = kind === 'fillet' ? `R${trim(size)}` : trim(size);

  return (
    <div className="edge-gizmo" ref={rootRef}>
      <button
        type="button"
        className="gizmo-anchor"
        aria-label="Reposition edge handle"
        onPointerDown={(event) => {
          if (frame) placement.start(event, placedAnchor.current, frame.outward);
        }}
        onPointerMove={placement.move}
        onPointerUp={placement.end}
        onPointerCancel={placement.cancel}
      />
      {/* The handle is offset outward; its head points back at the edge. Its transform is
          written every camera frame. */}
      <button
        aria-label="Drag to size"
        className={`edge-gizmo__handle${dragging ? ' edge-gizmo__handle--live' : ''}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            from: kind === 'chamfer' ? -size : size,
          };
          // A press released without a move never reaches onMove; this stops it committing the
          // size a previous drag left behind.
          lastSize.current = size;
          setDragging(true);
          setMenuOpen(false);
          event.preventDefault();
        }}
        ref={handleElRef}
        type="button"
      >
        <GizmoArrow />
      </button>

      <div className="edge-gizmo__bar" ref={barElRef}>
        <div className="edge-gizmo__kind-wrap">
          <button
            className="edge-gizmo__kind"
            disabled={lockKind}
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            {kind === 'fillet' ? 'Fillet' : 'Chamfer'}
            <span aria-hidden="true" className="edge-gizmo__chevron">
              ⌄
            </span>
          </button>

          {menuOpen && (
            <div className="edge-gizmo__menu" role="menu">
              <p className="edge-gizmo__menu-title">Chamfer/Fillet</p>
              {(['fillet', 'chamfer'] as const).map((option) => (
                <button
                  className="edge-gizmo__menu-item"
                  key={option}
                  onClick={() => {
                    setKind(option);
                    setMenuOpen(false);
                    if (size > 0) onPreview?.(option, size);
                  }}
                  role="menuitemradio"
                  aria-checked={kind === option}
                  type="button"
                >
                  <span className="edge-gizmo__tick">{kind === option ? '✓' : ''}</span>
                  {option === 'fillet' ? 'Fillet' : 'Chamfer'}
                </button>
              ))}
            </div>
          )}
        </div>

        {number.editing ? (
          <input
            className="edge-gizmo__value edge-gizmo__value--input"
            aria-label={kind === 'fillet' ? 'Fillet radius' : 'Chamfer distance'}
            ref={number.input}
            value={number.text}
            inputMode="decimal"
            type="text"
            onChange={(event) => number.change(event.target.value)}
            onBlur={number.finish}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                number.finish();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                number.cancel();
                onDismiss?.();
              }
            }}
          />
        ) : (
          <button className="edge-gizmo__value" onClick={() => number.start()} type="button">
            {label}
            <span className="edge-gizmo__unit">mm</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The on-screen direction pointing out of the solid: projects a probe point along the outward
 * direction next to the anchor. Falls back to the edge tangent rotated a quarter turn when the
 * outward sum degenerates (a knife edge, near-parallel faces), and to the arrow's drawn orientation
 * when there is no frame yet.
 */
function screenOutward(
  handle: ViewportHandle,
  anchor: { x: number; y: number; z: number },
  frame: EdgeFrame | null,
  at: { x: number; y: number },
): ScreenDir {
  // Scaled to the eye distance so the step covers about the same pixels at any zoom; floored so
  // it never collapses to zero when the camera sits on the anchor.
  const eye = handle.cameraPosition();
  const span = Math.max(
    Math.hypot(eye.x - anchor.x, eye.y - anchor.y, eye.z - anchor.z) * PROBE_FRACTION,
    1e-4,
  );

  const probe = (direction: { x: number; y: number; z: number }): ScreenDir | null => {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length < 1e-6) return null;
    const to = handle.project(
      anchor.x + (direction.x / length) * span,
      anchor.y + (direction.y / length) * span,
      anchor.z + (direction.z / length) * span,
    );
    if (to === null) return null;
    const dx = to.x - at.x;
    const dy = to.y - at.y;
    const screenLength = Math.hypot(dx, dy);
    return screenLength < 1e-3 ? null : { x: dx / screenLength, y: dy / screenLength };
  };

  if (frame !== null) {
    const outward = probe(frame.outward);
    if (outward !== null) return outward;

    // The tangent rotated a quarter turn in screen space: perpendicular to the edge is a better
    // guess than rightward when the outward sum is untrustworthy.
    const tangent = probe(frame.tangent);
    if (tangent !== null) return { x: -tangent.y, y: tangent.x };
  }

  return DEFAULT_DIR;
}

/** Rounds to 0.01 mm. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function trim(value: number): string {
  return String(Number(value.toFixed(2)));
}
