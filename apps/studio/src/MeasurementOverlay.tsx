/**
 * Measure overlay: click two points for the distance, a third for the angle at the second. A
 * full-canvas SVG over the geometry; points are stored in world space and projected every frame.
 * The distance is the straight-line (chord) length between the two hit points.
 */

/// <reference lib="dom" />

import { formatLength, type ViewSettings } from '@bezier/ui';
import { useEffect, useRef } from 'react';
import { setAttr, setStyle } from './dom-writes.js';
import type { ViewportHandle } from './Viewport.js';

type Vec3 = { x: number; y: number; z: number };

/**
 * Maximum snap points shown at once: a face's corners plus its middle. A face with more corners
 * shows the first eight rather than growing the pool inside the render loop.
 */
const SNAP_SLOTS = 8;

/** Stable React keys for the fixed snap pool, whose slots never reorder. */
const SNAP_KEYS = Array.from({ length: SNAP_SLOTS }, (_, i) => `snap-${i}`);

export interface MeasurementOverlayProps {
  handleRef: React.RefObject<ViewportHandle | null>;
  points: readonly Vec3[];
  settings: ViewSettings;
  showSnaps?: boolean;
}

export function MeasurementOverlay({
  handleRef,
  points,
  settings,
  showSnaps = false,
}: MeasurementOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lineRef = useRef<SVGLineElement | null>(null);
  const c1Ref = useRef<SVGCircleElement | null>(null);
  const c2Ref = useRef<SVGCircleElement | null>(null);
  // The third point of an angle, and the line from the second to it.
  const c3Ref = useRef<SVGCircleElement | null>(null);
  const line2Ref = useRef<SVGLineElement | null>(null);
  const textRef = useRef<SVGTextElement | null>(null);
  const bgRef = useRef<SVGRectElement | null>(null);
  /**
   * Snap points on the face under the pointer. A fixed pool of circles shown and hidden, not
   * mounted through React, since hover changes every frame (ADR 0007).
   */
  const snapRefs = useRef<(SVGCircleElement | null)[]>([]);

  // Keep all DOM refs so the effect closure captures them once.
  const ptRef = useRef(points);
  ptRef.current = points;
  // Read inside a loop registered once, so a unit change mid-measure applies on the next frame.
  const result =
    points[0] && points[1]
      ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y, points[1].z - points[0].z)
      : 0;
  const labelRef = useRef('');
  labelRef.current = formatLength(result, settings);
  const showSnapsRef = useRef(showSnaps);
  showSnapsRef.current = showSnaps;

  useEffect(() => {
    let frame = 0;
    let previousLabel = '';
    let textWidth = 60;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const handle = handleRef.current;
      const svg = svgRef.current;
      if (handle === null || svg === null) return;

      const pts = ptRef.current;
      const a =
        pts[0] !== undefined && handle.pointVisible(pts[0].x, pts[0].y, pts[0].z)
          ? handle.project(pts[0].x, pts[0].y, pts[0].z)
          : null;
      const b =
        pts[1] !== undefined && handle.pointVisible(pts[1].x, pts[1].y, pts[1].z)
          ? handle.project(pts[1].x, pts[1].y, pts[1].z)
          : null;
      const spanVisible =
        pts[0] !== undefined &&
        pts[1] !== undefined &&
        handle.pointVisible(
          (pts[0].x + pts[1].x) / 2,
          (pts[0].y + pts[1].y) / 2,
          (pts[0].z + pts[1].z) / 2,
        );

      const c =
        pts[2] !== undefined && handle.pointVisible(pts[2].x, pts[2].y, pts[2].z)
          ? handle.project(pts[2].x, pts[2].y, pts[2].z)
          : null;
      const c3 = c3Ref.current;
      const line2 = line2Ref.current;
      if (c3 !== null && line2 !== null) {
        const shown = c !== null && b !== null;
        // The second leg follows the same rule as the first: not drawn through the solid.
        const legVisible =
          shown &&
          pts[1] !== undefined &&
          pts[2] !== undefined &&
          handle.pointVisible(
            (pts[1].x + pts[2].x) / 2,
            (pts[1].y + pts[2].y) / 2,
            (pts[1].z + pts[2].z) / 2,
          );
        setStyle(c3, 'display', shown ? '' : 'none');
        setStyle(line2, 'display', legVisible ? '' : 'none');
        if (shown) {
          setAttr(c3, 'cx', String(c.x));
          setAttr(c3, 'cy', String(c.y));
          setAttr(line2, 'x1', String(b.x));
          setAttr(line2, 'y1', String(b.y));
          setAttr(line2, 'x2', String(c.x));
          setAttr(line2, 'y2', String(c.y));
        }
      }

      const line = lineRef.current;
      const c1 = c1Ref.current;
      const c2 = c2Ref.current;
      const text = textRef.current;
      const bg = bgRef.current;

      if (c1 !== null && a !== null) {
        setAttr(c1, 'cx', String(a.x));
        setAttr(c1, 'cy', String(a.y));
        setStyle(c1, 'display', '');
      } else if (c1 !== null) {
        setStyle(c1, 'display', 'none');
      }

      if (c2 !== null && b !== null) {
        setAttr(c2, 'cx', String(b.x));
        setAttr(c2, 'cy', String(b.y));
        setStyle(c2, 'display', '');
      } else if (c2 !== null) {
        setStyle(c2, 'display', 'none');
      }

      if (line !== null && a !== null && b !== null && spanVisible) {
        setAttr(line, 'x1', String(a.x));
        setAttr(line, 'y1', String(a.y));
        setAttr(line, 'x2', String(b.x));
        setAttr(line, 'y2', String(b.y));
        setStyle(line, 'display', '');
      } else if (line !== null) {
        setStyle(line, 'display', 'none');
      }

      if (
        text !== null &&
        bg !== null &&
        a !== null &&
        b !== null &&
        spanVisible &&
        pts[0] &&
        pts[1]
      ) {
        const label = labelRef.current;
        if (label !== previousLabel) {
          setStyle(text, 'display', '');
          text.textContent = label;
          textWidth = text.getBBox().width;
          previousLabel = label;
        }
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        setAttr(text, 'x', String(mx));
        setAttr(text, 'y', String(my - 10));
        const tw = textWidth;
        setAttr(bg, 'x', String(mx - tw / 2 - 6));
        setAttr(bg, 'y', String(my - 26));
        setAttr(bg, 'width', String(tw + 12));
        setAttr(bg, 'height', '20');
        setStyle(text, 'display', '');
        setStyle(bg, 'display', '');
      } else if (text !== null && bg !== null) {
        setStyle(text, 'display', 'none');
        setStyle(bg, 'display', 'none');
      }

      // Snap points of whatever is under the pointer, read from the viewport each frame rather than
      // passed as a prop, which would mean a React pass per mouse move.
      const snaps = handle.snapPoints();
      for (let i = 0; i < SNAP_SLOTS; i++) {
        const dot = snapRefs.current[i];
        if (dot === undefined || dot === null) continue;
        const point = showSnapsRef.current ? snaps[i] : undefined;
        const at =
          point === undefined || !handle.pointVisible(point.x, point.y, point.z)
            ? null
            : handle.project(point.x, point.y, point.z);
        if (at === null) {
          setStyle(dot, 'display', 'none');
          continue;
        }
        setStyle(dot, 'display', '');
        setAttr(dot, 'cx', String(at.x));
        setAttr(dot, 'cy', String(at.y));
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [handleRef]);

  return (
    <svg
      aria-hidden="true"
      className="measure-overlay"
      ref={svgRef}
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        top: 'calc(-1 * var(--bar-height))',
        left: 0,
        width: '100%',
        height: 'calc(100% + var(--bar-height))',
      }}
    >
      <line
        ref={lineRef}
        stroke="var(--select)"
        strokeDasharray="4 3"
        strokeWidth={1.5}
        style={{ display: 'none' }}
        x1={0}
        x2={0}
        y1={0}
        y2={0}
      />
      {/* Drawn under the measurement, so a chosen point sits above its snap marker. Hollow:
          possible points, not chosen ones. */}
      {SNAP_KEYS.map((key, i) => (
        <circle
          cx={0}
          cy={0}
          fill="var(--surface-popover)"
          key={key}
          r={3.5}
          ref={(el) => {
            snapRefs.current[i] = el;
          }}
          stroke="var(--select)"
          strokeWidth={1.5}
          style={{ display: 'none' }}
        />
      ))}
      <circle
        cx={0}
        cy={0}
        fill="var(--select)"
        stroke="var(--surface-popover)"
        strokeWidth={2}
        r={5}
        ref={c1Ref}
        style={{ display: 'none' }}
      />
      <circle
        cx={0}
        cy={0}
        fill="var(--select)"
        stroke="var(--surface-popover)"
        strokeWidth={2}
        r={5}
        ref={c2Ref}
        style={{ display: 'none' }}
      />
      <line
        ref={line2Ref}
        stroke="var(--select)"
        strokeDasharray="4 3"
        strokeWidth={1.5}
        style={{ display: 'none' }}
        x1={0}
        x2={0}
        y1={0}
        y2={0}
      />
      <circle
        cx={0}
        cy={0}
        fill="var(--select)"
        stroke="var(--surface-popover)"
        strokeWidth={2}
        r={5}
        ref={c3Ref}
        style={{ display: 'none' }}
      />
      <rect
        fill="var(--surface-popover)"
        height={20}
        ref={bgRef}
        rx={4}
        style={{ display: 'none' }}
        width={60}
        x={0}
        y={0}
      />
      <text
        fill="var(--text)"
        fontSize={12}
        ref={textRef}
        style={{ display: 'none' }}
        textAnchor="middle"
        x={0}
        y={0}
      >
        0 mm
      </text>
    </svg>
  );
}
