/** Supports, loads and thermal conditions drawn on the part as arrows and markers. */

import type { Vec3 } from '@bezier/sim';
import { type RefObject, useEffect, useRef } from 'react';
import { setAttr } from '../dom-writes.js';
import type { ViewportHandle } from '../Viewport.js';
import { format } from './SimulationParts.js';
import type { Placement, SimulationHandle } from './use-simulation.js';

/**
 * Load arrows and support markers attached to their faces. Positioned every frame from the
 * viewport's projection and written straight into the SVG through refs, since the render loop
 * never goes through React (ADR 0007).
 */
export function PlacementGlyphs({
  sim,
  handleRef,
}: {
  sim: SimulationHandle;
  handleRef: RefObject<ViewportHandle | null>;
}) {
  const items = sim.placements.filter(
    (placement): placement is Exclude<Placement, { kind: 'gravity' }> =>
      'faces' in placement && placement.faces.length > 0,
  );
  const groups = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const handle = handleRef.current;
      items.forEach((placement, index) => {
        const group = groups.current[index];
        if (group === null || group === undefined || handle === null) return;
        // Average the centroids of the placement's faces: one glyph per placement.
        let x = 0,
          y = 0,
          z = 0,
          n = 0;
        let normal: { x: number; y: number; z: number } | null = null;
        for (const key of placement.faces) {
          const ref = sim.faceRefOf(key);
          if (ref === null) continue;
          const centre = handle.faceCentroid(ref);
          if (centre === null) continue;
          x += centre.x;
          y += centre.y;
          z += centre.z;
          n++;
          normal ??= handle.faceNormal(ref);
        }
        const at = n > 0 ? handle.project(x / n, y / n, z / n) : null;
        if (at === null) {
          setAttr(group, 'visibility', 'hidden');
          return;
        }
        setAttr(group, 'visibility', 'visible');
        setAttr(group, 'opacity', handle.pointVisible(x / n, y / n, z / n) ? '1' : '0.35');
        // Screen direction of the load, from the world direction projected one millimetre along it.
        // Supports sit outward along the face normal.
        // Heat goes in like a pressure; everything else stands outward along the face normal.
        const inward = placement.kind === 'pressure' || placement.kind === 'heat';
        const world: Vec3 =
          placement.kind === 'force'
            ? placement.direction
            : normal === null
              ? [0, 0, 1]
              : inward
                ? [-normal.x, -normal.y, -normal.z]
                : [normal.x, normal.y, normal.z];
        const tip = handle.project(x / n + world[0], y / n + world[1], z / n + world[2]);
        let dx = 0,
          dy = -1;
        if (tip !== null) {
          const length = Math.hypot(tip.x - at.x, tip.y - at.y);
          if (length > 1e-6) {
            dx = (tip.x - at.x) / length;
            dy = (tip.y - at.y) / length;
          }
        }
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        setAttr(group, 'transform', `translate(${at.x} ${at.y}) rotate(${angle})`);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handleRef, items, sim]);

  return (
    <svg aria-hidden="true" className="sim-glyphs">
      {items.map((placement, index) => (
        <g
          data-kind={placement.kind}
          data-editing={sim.editing?.id === placement.id ? '' : undefined}
          key={placement.id}
          ref={(element) => {
            groups.current[index] = element;
          }}
          visibility="hidden"
        >
          <Glyph placement={placement} />
        </g>
      ))}
    </svg>
  );
}

/** One placement's mark, drawn along +x ending at the face, then rotated into place. */
function Glyph({ placement }: { placement: Exclude<Placement, { kind: 'gravity' }> }) {
  switch (placement.kind) {
    case 'force':
      return (
        <>
          <line x1={-64} x2={-10} y1={0} y2={0} />
          <path d="M -12 -6 L 0 0 L -12 6 Z" />
          <text x={-70} y={-10}>
            {format(placement.magnitude)} N
          </text>
        </>
      );
    case 'pressure':
    case 'heat':
      return (
        <>
          {[-14, 0, 14].map((offset) => (
            <g key={offset} transform={`translate(0 ${offset})`}>
              {placement.kind === 'heat' ? (
                <path className="sim-glyphs__wave" d="M -40 0 q 5 -5 10 0 t 10 0 t 10 0" />
              ) : (
                <line x1={-38} x2={-8} y1={0} y2={0} />
              )}
              <path d="M -9 -4 L 0 0 L -9 4 Z" />
            </g>
          ))}
          <text x={-44} y={-22}>
            {placement.kind === 'heat'
              ? `${format(placement.power)} W`
              : `${format(placement.pressure)} MPa`}
          </text>
        </>
      );
    case 'temperature':
      return (
        <>
          <circle r={12} />
          <text className="sim-glyphs__inside" x={0} y={4}>
            {format(placement.temperature)}°
          </text>
        </>
      );
    case 'convection':
      return (
        <>
          <circle r={12} />
          <path
            className="sim-glyphs__wave"
            d="M -6 -3 q 3 -3 6 0 t 6 0 M -6 3 q 3 -3 6 0 t 6 0"
            transform="rotate(90)"
          />
        </>
      );
    default:
      return (
        <>
          <circle r={11} />
          <path
            d={
              placement.kind === 'fixed'
                ? 'M -5 -3 h 10 M -4 3 l 2 -3 M 0 3 l 2 -3 M 4 3 l 2 -3'
                : placement.kind === 'pin'
                  ? 'M 0 -5 L -5 4 L 5 4 Z'
                  : 'M 0 -6 L -5 2 L 5 2 Z M -3 5 a 1 1 0 1 0 0.1 0 M 3 5 a 1 1 0 1 0 0.1 0'
            }
            transform="rotate(90)"
          />
        </>
      );
  }
}
