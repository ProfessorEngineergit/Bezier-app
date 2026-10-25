/**
 * The constraints that apply to the current sketch selection, as a row of buttons. Only applicable
 * tools are shown: two lines offer Parallel, Perpendicular and Equal; a line and a circle, Tangent.
 */

import type { Sketch, SketchId } from '@bezier/solver';
import { CONSTRAINT_TOOLS, type ConstraintTool, dimensionOf } from '@bezier/ui';
import { useState } from 'react';
import './constraint-bar.css';

/** Which tools apply to a selection of this shape. */
export function toolsFor(sketch: Sketch, selected: readonly SketchId[]): readonly ConstraintTool[] {
  const picked = selected.map((id) => sketch.primitives.find((primitive) => primitive.id === id));
  const kinds = picked.map((primitive) => primitive?.kind ?? 'point');
  const lines = kinds.filter((kind) => kind === 'line').length;
  const rounds = kinds.filter((kind) => kind === 'arc' || kind === 'circle').length;
  const points = kinds.filter((kind) => kind === 'point').length;
  const tools: ConstraintTool[] = [];
  if (lines > 0 && rounds === 0 && points === 0) tools.push('horizontal', 'vertical');
  if (lines === 2 && kinds.length === 2) tools.push('parallel', 'perpendicular', 'angle', 'equal');
  if (lines === 2 && kinds.length === 2) tools.push('collinear', 'lengthRatio');
  if ((lines === 3 || lines === 4) && kinds.length === lines) tools.push('equalAngle');
  if (points === 2 && kinds.length === 2) tools.push('horizontal', 'vertical');
  if (rounds === 2 && kinds.length === 2) tools.push('equal', 'concentric');
  if (kinds.length === 2 && rounds >= 1 && points === 0) tools.push('tangent');
  if (kinds.length === 2) tools.push('coincident');
  if (points === 1 && kinds.length === 2 && lines + rounds === 1) tools.push('pointOn');
  if (points === 1 && lines === 1 && kinds.length === 2)
    tools.push('midpoint', 'pointLineDistance');
  if (points === 2 && kinds.length === 2)
    tools.push('distance', 'horizontalDistance', 'verticalDistance');
  if ((points === 2 && lines === 1 && kinds.length === 3) || (points === 3 && kinds.length === 3))
    tools.push('symmetric');
  const [only] = picked;
  if (picked.length === 1 && only !== undefined && dimensionOf(sketch, only) !== undefined)
    tools.push('reference');
  // No Fix tool. The solver still supports `lock`, which imported or older sketches may carry.
  return tools;
}

export function ConstraintBar({
  sketch,
  selected,
  onConstrain,
  onCorner,
}: {
  sketch: Sketch;
  selected: readonly SketchId[];
  onConstrain: (tool: ConstraintTool) => void;
  /** Round or bevel the corner the two selected lines share. */
  onCorner?: (style: 'fillet' | 'chamfer', size: number) => void;
}) {
  const tools = toolsFor(sketch, selected);
  const [size, setSize] = useState('2');
  if (tools.length === 0) return null;
  const corner = onCorner !== undefined && meetingLines(sketch, selected);
  const value = Number(size.replace(',', '.'));
  return (
    <section aria-label="Constraints" className="constraint-bar">
      {CONSTRAINT_TOOLS.filter((tool) => tools.includes(tool.id)).map((tool) => (
        <button
          key={tool.id}
          onClick={() => onConstrain(tool.id)}
          // Keep the sketch selection: a press here must not reach the canvas.
          onPointerDown={(event) => event.stopPropagation()}
          title={tool.label}
          type="button"
        >
          <span aria-hidden="true" className="constraint-bar__mark">
            {tool.mark}
          </span>
          {tool.label}
        </button>
      ))}
      {corner && (
        <span className="constraint-bar__corner">
          <input
            aria-label="Corner size"
            inputMode="decimal"
            onChange={(event) => setSize(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' && value > 0) onCorner('fillet', value);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            value={size}
          />
          {(['fillet', 'chamfer'] as const).map((style) => (
            <button
              disabled={!(value > 0)}
              key={style}
              onClick={() => onCorner(style, value)}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              {style === 'fillet' ? 'Fillet' : 'Chamfer'}
            </button>
          ))}
        </span>
      )}
    </section>
  );
}

/** Whether the selection is two lines that share an end: a corner to round. */
function meetingLines(sketch: Sketch, selected: readonly SketchId[]): boolean {
  const lines = selected
    .map((id) => sketch.primitives.find((primitive) => primitive.id === id))
    .filter((primitive) => primitive?.kind === 'line');
  const [a, b] = lines;
  if (lines.length !== 2 || a?.kind !== 'line' || b?.kind !== 'line') return false;
  return a.start === b.start || a.start === b.end || a.end === b.start || a.end === b.end;
}
