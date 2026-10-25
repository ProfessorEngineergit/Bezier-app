/**
 * A small diagram of the aperture's effect: five posts in a row and a focus line. The post on the
 * line is sharp, the others blur with distance, faster with a wider aperture (larger `depth`). It
 * shows which things will be soft, which a slider value does not.
 */

import { useId } from 'react';

interface FocusDiagramProps {
  /** Focus position along the row, 0.2 (near) to 2 (far), as on the Focus Distance slider. */
  focus: number;
  /** Blur strength away from the focus, 0 to 1. */
  blur: number;
}

/** Where the posts stand along the row, 0 near and 1 far. */
const ALONG = [0, 0.25, 0.5, 0.75, 1] as const;
const WIDTH = 240;
const HEIGHT = 64;

export function FocusDiagram({ focus, blur }: FocusDiagramProps) {
  const id = useId();
  // The slider's range is mapped across the row, near on the left.
  const at = (focus - 0.2) / 1.8;
  return (
    <svg
      aria-hidden="true"
      className="viz-focus"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <defs>
        {ALONG.map((along) => (
          <filter height="200%" id={`${id}-${along}`} key={along} width="400%" x="-150%" y="-50%">
            <feGaussianBlur stdDeviation={Math.abs(along - at) * blur * 7} />
          </filter>
        ))}
      </defs>
      <line className="viz-focus__ground" x1="8" x2={WIDTH - 8} y1="54" y2="54" />
      {ALONG.map((along) => {
        const x = 30 + along * (WIDTH - 60);
        // Farther posts are smaller.
        const height = 36 - along * 14;
        return (
          <rect
            className="viz-focus__post"
            filter={`url(#${id}-${along})`}
            height={height}
            key={along}
            rx="3"
            width="10"
            x={x - 5}
            y={54 - height}
          />
        );
      })}
      <line
        className="viz-focus__plane"
        x1={30 + at * (WIDTH - 60)}
        x2={30 + at * (WIDTH - 60)}
        y1="6"
        y2="58"
      />
    </svg>
  );
}
