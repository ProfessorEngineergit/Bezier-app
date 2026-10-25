/**
 * The SECTION A–A cutting plane on the front view and the DETAIL B circle on the top view
 * (`drawing-callouts.ts`), drawn per ISO 128: a thin chain line, thick at the ends, with arrows in
 * the viewing direction and a letter at each; a thin circle with its letter. Lines, paths and text
 * only, so the PDF and DXF exports carry them like the views.
 */

import { detailCallout, sectionCallout } from './drawing-callouts.js';
import type { SheetView } from './drawing-sheet.js';

const INK = '#1f2830';

interface Props {
  layout: readonly SheetView[];
  section: number | null;
  detail: { on: boolean; x: number; y: number; radius: number };
  weight: number;
}

export function DrawingCallouts({ layout, section, detail, weight }: Props) {
  const cut = sectionCallout(layout, section);
  const circle = detailCallout(layout, detail);
  return (
    <g data-callouts="" fill="none" stroke={INK}>
      {cut !== null && (
        <g aria-label="Section A–A cutting plane">
          <line
            strokeDasharray="8 1.5 1 1.5"
            strokeWidth={weight * 0.4}
            x1={cut.from[0]}
            x2={cut.to[0]}
            y1={cut.from[1]}
            y2={cut.to[1]}
          />
          {[cut.from, cut.to].map(([x, y], end) => {
            // The thick end runs inward from the tip, the arrow stands on the tip.
            const inward = end === 0 ? 1 : -1;
            return (
              <g key={x}>
                <line strokeWidth={weight * 1.4} x1={x} x2={x + inward * 4} y1={y} y2={y} />
                <line strokeWidth={weight * 0.5} x1={x} x2={x} y1={y} y2={y + cut.arrow} />
                <path d={`M${x} ${y + cut.arrow + 0.4}l-1 -2.6h2Z`} fill={INK} stroke="none" />
                <text
                  fill={INK}
                  fontSize="3.5"
                  fontWeight="600"
                  stroke="none"
                  textAnchor="middle"
                  x={x - inward * 2.6}
                  y={y + cut.arrow + 1}
                >
                  A
                </text>
              </g>
            );
          })}
        </g>
      )}
      {circle !== null && (
        <g aria-label="Detail B outline">
          {/* A path and not a circle: the DXF export reads paths, lines, polylines and rects. */}
          <path
            d={`M${circle.centre[0] - circle.radius} ${circle.centre[1]}a${circle.radius} ${circle.radius} 0 1 0 ${circle.radius * 2} 0a${circle.radius} ${circle.radius} 0 1 0 ${-circle.radius * 2} 0`}
            strokeWidth={weight * 0.4}
          />
          <text
            fill={INK}
            fontSize="3.5"
            fontWeight="600"
            stroke="none"
            x={circle.centre[0] + circle.radius * 0.72 + 1}
            y={circle.centre[1] - circle.radius * 0.72 - 1}
          >
            B
          </text>
        </g>
      )}
    </g>
  );
}
