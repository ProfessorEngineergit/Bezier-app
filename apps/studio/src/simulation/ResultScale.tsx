/** The vertical colour scale of a result on the model, with the value under the pointer on it. */

import type { RefObject } from 'react';
import type { ViewportHandle } from '../Viewport.js';
import { ResultHover } from './ResultHover.js';
import { format } from './SimulationParts.js';
import './sim-inspector.css';

export interface ScaleLegend {
  label: string;
  unit: string;
  min: number;
  max: number;
  palette: string;
}

export function ResultScale({
  legend,
  banded,
  top,
  handleRef,
}: {
  legend: ScaleLegend;
  banded: boolean;
  /** What the top tick says, when the scale is cut off there (a safety factor of 8 and more). */
  top?: string;
  handleRef: RefObject<ViewportHandle | null>;
}) {
  const ticks = Array.from(
    { length: 6 },
    (_, i) => legend.max - ((legend.max - legend.min) * i) / 5,
  );
  return (
    <div className="sim-legend" data-palette={legend.palette}>
      <div className="sim-legend__title">
        {legend.label}
        {legend.unit !== '' && <small>{legend.unit}</small>}
      </div>
      <div className="sim-legend__scale">
        <div className="sim-legend__bar" data-banded={banded ? '' : undefined}>
          <ResultHover handleRef={handleRef} max={legend.max} min={legend.min} unit={legend.unit} />
        </div>
        <ol>
          {ticks.map((tick, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the ticks are positional
            <li key={index}>{index === 0 && top !== undefined ? top : format(tick)}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
