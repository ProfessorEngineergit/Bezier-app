/** World-fixed handles; camera motion updates DOM transforms without React renders. */
import { type RefObject, useEffect, useRef } from 'react';
import { px, setAttr, setStyle } from './dom-writes.js';
import { AXES, type Basis, PLANES, type Point } from './move-gizmo-math.js';
import type { ViewportHandle } from './Viewport.js';

export function useMoveGizmoFrame(
  handleRef: RefObject<ViewportHandle | null>,
  initialPivot: Point | null,
) {
  const root = useRef<HTMLDivElement | null>(null);
  const elements = useRef<Record<string, HTMLElement | SVGElement | null>>({});
  const pivot = useRef<Point | null>(initialPivot);
  const signs = useRef<Point | null>(null);
  const offset = useRef<Point>({ x: 0, y: 0, z: 0 });
  const basis = useRef<Record<string, Basis>>({
    x: { x: 0, y: 0, depth: 0 },
    y: { x: 0, y: 0, depth: 0 },
    z: { x: 0, y: 0, depth: 0 },
  });
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const handle = handleRef.current;
      const element = root.current;
      if (!handle || !element) return;
      pivot.current ??= handle.contentCenter();
      const p = pivot.current;
      if (!p) {
        setStyle(element, 'visibility', 'hidden');
        return;
      }
      // Pick a readable octant once; handles never flip while the camera orbits.
      if (!signs.current) {
        const camera = handle.cameraPosition();
        signs.current = {
          x: camera.x < p.x ? -1 : 1,
          y: camera.y < p.y ? -1 : 1,
          z: camera.z < p.z ? -1 : 1,
        };
      }
      const x = p.x + offset.current.x;
      const y = p.y + offset.current.y;
      const z = p.z + offset.current.z;
      const origin = handle.project(x, y, z);
      if (!origin) {
        setStyle(element, 'visibility', 'hidden');
        return;
      }
      setStyle(element, 'visibility', 'visible');
      setStyle(element, 'left', px(origin.x));
      setStyle(element, 'top', px(origin.y));
      let longest = 0;
      for (const axis of AXES) {
        const plus = handle.project(x + +(axis === 'x'), y + +(axis === 'y'), z + +(axis === 'z'));
        const minus = handle.project(x - +(axis === 'x'), y - +(axis === 'y'), z - +(axis === 'z'));
        const a = basis.current[axis];
        if (!a || !plus || !minus) continue;
        const positive = Math.hypot(plus.x - origin.x, plus.y - origin.y);
        const negative = Math.hypot(minus.x - origin.x, minus.y - origin.y);
        a.depth = positive + negative > 1e-8 ? (negative - positive) / (negative + positive) : 0;
        a.x = (plus.x - origin.x) * (1 + a.depth);
        a.y = (plus.y - origin.y) * (1 + a.depth);
        longest = Math.max(longest, Math.hypot(a.x, a.y));
      }
      if (longest < 1e-8) return;
      for (const axis of AXES) {
        const a = basis.current[axis];
        const arrow = elements.current[`t-${axis}`];
        if (!a || !arrow) continue;
        const length = Math.hypot(a.x, a.y);
        setStyle(arrow, 'visibility', length < longest * 0.15 ? 'hidden' : 'visible');
        const sign = signs.current[axis];
        setStyle(
          arrow,
          'transform',
          `translate(${(a.x / longest) * 60 * sign}px,${(a.y / longest) * 60 * sign}px) translate(-50%,-50%) rotate(${Math.atan2(a.y, a.x)}rad)`,
        );
      }
      for (const plane of PLANES) {
        const a = basis.current[plane.a];
        const b = basis.current[plane.b];
        if (!a || !b) continue;
        const ax = (a.x / longest) * signs.current[plane.a],
          ay = (a.y / longest) * signs.current[plane.a];
        const bx = (b.x / longest) * signs.current[plane.b],
          by = (b.y / longest) * signs.current[plane.b];
        const visible = Math.abs(ax * by - ay * bx) > 0.12;
        const pad = elements.current[`p-${plane.key}`];
        const turn = elements.current[`r-${plane.normal}`];
        if (pad) {
          setStyle(pad, 'visibility', visible ? 'visible' : 'hidden');
          setStyle(
            pad,
            'transform',
            `matrix(${ax},${ay},${bx},${by},${(ax + bx) * 17},${(ay + by) * 17})`,
          );
        }
        if (turn) {
          setStyle(turn, 'visibility', visible ? 'visible' : 'hidden');
          setAttr(turn, 'transform', `matrix(${ax} ${ay} ${bx} ${by} 120 120)`);
        }
        // The angle label stays upright beside its arc from any camera; in the rotated plane it
        // would lean with it.
        const label = elements.current[`l-${plane.normal}`];
        if (label instanceof HTMLElement)
          setStyle(
            label,
            'transform',
            `translate(${px((ax + bx) * 96)},${px((ay + by) * 96)}) translate(-50%,-50%)`,
          );
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [handleRef]);
  return { root, elements, pivot, offset, basis };
}
