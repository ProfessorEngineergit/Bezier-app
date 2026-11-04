/**
 * Wall thickness: colours the model by how thick it is at every point, against the thinnest wall
 * the printer or the process can make. Red is too thin, green is fine; the panel says what the
 * thinnest wall is. It looks, and changes nothing.
 */

import { typedNumber } from '@bezier/ui';
import { type RefObject, useEffect, useMemo, useState } from 'react';
import { InspectionPanel } from './InspectionPanel.js';
import { useScrub } from './scrub.js';
import type { SessionView } from './session.js';
import { ResultScale } from './simulation/ResultScale.js';
import type { ViewportHandle } from './Viewport.js';

/** A wall two lines of a 0.4 mm nozzle wide, the usual thinnest print. */
const DEFAULT_LIMIT = 0.8;

const mm = (value: number) => String(Number(value.toFixed(2)));

export function WallThicknessPanel({
  view,
  handleRef,
  onClose,
}: {
  view: SessionView | null;
  handleRef: RefObject<ViewportHandle | null>;
  onClose: () => void;
}) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [text, setText] = useState(String(DEFAULT_LIMIT));
  const valid = (typedNumber(text) ?? 0) > 0;
  // Dragged up or down like every number in Bezier, a twentieth of a millimetre per pixel.
  const scrub = useScrub({
    value: limit,
    step: 0.05,
    onChange: (next) => {
      const value = Math.max(0.05, Number(next.toFixed(2)));
      setLimit(value);
      setText(mm(value));
    },
  });
  const [found, setFound] = useState<{ thinnest: number; thin: number } | null>(null);
  const display = view?.display ?? null;

  useEffect(() => {
    if (display === null) return;
    setFound(handleRef.current?.showWallThickness(limit) ?? null);
    return () => {
      handleRef.current?.showWallThickness(null);
    };
  }, [display, limit, handleRef]);

  const verdict = useMemo(() => {
    if (found === null) return 'Nothing to measure yet.';
    if (!Number.isFinite(found.thinnest)) return 'Nothing to measure yet.';
    const thinnest = `Thinnest wall ${found.thinnest.toFixed(2)} mm`;
    if (found.thin === 0) return `${thinnest}. Everything is above the limit.`;
    return `${thinnest}. ${Math.max(1, Math.round(found.thin * 100))} % of the part is under it.`;
  }, [found]);

  return (
    <InspectionPanel label="Wall thickness" onClose={onClose} title="Wall thickness">
      <div className="wall-panel">
        <label className="inspection-number">
          Thinnest allowed
          <span>
            <input
              {...scrub}
              aria-invalid={!valid}
              inputMode="decimal"
              onBlur={() => setText(mm(limit))}
              onChange={(event) => {
                setText(event.target.value);
                const value = typedNumber(event.target.value);
                if (value !== null && value > 0) setLimit(value);
              }}
              type="text"
              value={text}
            />
            <span>mm</span>
          </span>
        </label>
        <ResultScale
          handleRef={handleRef}
          banded={false}
          legend={{ label: 'Wall', unit: 'mm', min: 0, max: limit * 3, palette: 'safety' }}
        />
        <p className="wall-panel__verdict">{verdict}</p>
      </div>
    </InspectionPanel>
  );
}
