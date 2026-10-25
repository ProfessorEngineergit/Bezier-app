/**
 * Renders the face from `face.ts`. Moving parts rotate about their own centres
 * (`transform-box: view-box` with an origin in drawing units), so moods are just transforms that
 * CSS transitions between.
 */

import { useId } from 'react';
import { type Face, faceTransforms, LAYOUT } from './face.js';

export function NibFace({ face }: { face: Face }) {
  const id = useId().replace(/:/g, '');
  const t = faceTransforms(face);
  const { visor, eyes, eyeY, ring, lens, browY, cheekY } = LAYOUT;
  const origin = (x: number, y: number) => `${x}px ${y}px`;
  return (
    <svg
      aria-hidden="true"
      className="nib-face"
      focusable="false"
      viewBox={`0 0 ${LAYOUT.size} ${LAYOUT.size}`}
    >
      <defs>
        <radialGradient cx="35%" cy="30%" id={`${id}-lens`} r="75%">
          <stop offset="0" stopColor="#56606e" />
          <stop offset="1" stopColor="#1f242c" />
        </radialGradient>
        <linearGradient id={`${id}-sheen`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {eyes.map((x) => (
          <clipPath id={`${id}-eye-${x}`} key={x}>
            <circle cx={x} cy={eyeY} r={ring - 0.6} />
          </clipPath>
        ))}
      </defs>

      <rect
        className="nib-face__visor"
        height={visor.height}
        rx={visor.radius}
        width={visor.width}
        x={visor.x}
        y={visor.y}
      />

      {eyes.map((x) => (
        <g
          className="nib-face__eye"
          key={x}
          style={{ transformOrigin: origin(x, eyeY), transform: t.eyes }}
        >
          <g clipPath={`url(#${id}-eye-${x})`}>
            <g className="nib-face__lens" style={{ transform: t.lens }}>
              <circle cx={x} cy={eyeY} fill={`url(#${id}-lens)`} r={lens} />
              <circle cx={x - 1.1} cy={eyeY - 1.2} fill="#fff" opacity="0.75" r="0.85" />
            </g>
            <rect
              className="nib-face__lid"
              height={ring * 2}
              style={{ transformOrigin: origin(x, eyeY - ring), transform: t.top }}
              width={ring * 2}
              x={x - ring}
              y={eyeY - ring}
            />
            <rect
              className="nib-face__lid"
              height={ring * 2}
              style={{ transformOrigin: origin(x, eyeY + ring), transform: t.bottom }}
              width={ring * 2}
              x={x - ring}
              y={eyeY - ring}
            />
          </g>
          <circle className="nib-face__ring" cx={x} cy={eyeY} r={ring - 0.3} />
        </g>
      ))}

      {eyes.map((x, side) => (
        <path
          className="nib-face__brow"
          d={`M${x - 3.6} ${browY + 0.7}Q${x} ${browY - 1.3} ${x + 3.6} ${browY + 0.7}`}
          key={x}
          style={{
            transformOrigin: origin(x, browY),
            transform: side === 0 ? t.browLeft : t.browRight,
          }}
        />
      ))}

      <g className="nib-face__cheeks" style={{ transform: t.cheeks }}>
        {eyes.map((x) => (
          <path
            className="nib-face__cheek"
            d={`M${x - 3.4} ${cheekY}Q${x} ${cheekY + 1.5} ${x + 3.4} ${cheekY}`}
            key={x}
          />
        ))}
      </g>

      <rect
        fill={`url(#${id}-sheen)`}
        height={visor.height}
        pointerEvents="none"
        rx={visor.radius}
        width={visor.width}
        x={visor.x}
        y={visor.y}
      />
    </svg>
  );
}
