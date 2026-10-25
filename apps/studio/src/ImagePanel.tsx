/**
 * The reference image's values in a panel, for exact sizes the handles cannot hit. Every change is
 * one history step.
 */

import type { FeatureRecord } from '@bezier/core';
import { Slider } from '@bezier/ui';
import { useEffect, useRef, useState } from 'react';
import { ImageNumberField } from './ImageNumberField.js';
import { InspectionPanel } from './InspectionPanel.js';
import {
  type Placement,
  placementOf,
  placementParams,
  rotateBy,
  uncrop,
} from './image/placement.js';

export type ImageMode = 'place' | 'crop';

const PLANES = ['XY', 'XZ', 'YZ'] as const;

/** Returns only the changed parameters, so a patch writes nothing else. */
export function changed(
  before: Record<string, number>,
  after: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(after))
    if (Math.abs(value - (before[key] ?? 0)) > 1e-9) out[key] = value;
  return out;
}

export function ImagePanel({
  feature,
  mode,
  onMode,
  keepShape,
  onKeepShape,
  onPatch,
  onOpacity,
  onClose,
}: {
  feature: FeatureRecord;
  mode: ImageMode;
  onMode: (mode: ImageMode) => void;
  keepShape: boolean;
  onKeepShape: (keep: boolean) => void;
  onPatch: (params: Record<string, unknown>) => void;
  /** Called while the slider moves; previews without saving. */
  onOpacity: (opacity: number) => void;
  onClose: () => void;
}) {
  const placement = placementOf(feature.params);
  const params = placementParams(placement);
  const opacity = typeof feature.params.opacity === 'number' ? feature.params.opacity : 0.8;
  const plane = PLANES.find((name) => name === feature.params.plane) ?? 'XY';
  const offset = typeof feature.params.offset === 'number' ? feature.params.offset : 0;
  const cropped = Object.values(placement.crop).some((part) => part > 0);

  /** Applies a new placement, writing only the changed values. */
  const place = (next: Placement) => onPatch(changed(params, placementParams(next)));

  // Dragging the slider passes many values; only the last is saved, shortly after it stops.
  const [shownOpacity, setShownOpacity] = useState(opacity);
  const saved = useRef(opacity);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    saved.current = opacity;
    setShownOpacity(opacity);
  }, [opacity]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const slide = (value: number) => {
    setShownOpacity(value);
    onOpacity(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (Math.abs(value - saved.current) > 1e-9) onPatch({ opacity: value });
    }, 300);
  };

  const ratio = placement.width / placement.height;
  return (
    <InspectionPanel label="Image" onClose={onClose} title={feature.name}>
      <div className="image-panel">
        <p className="image-panel__caption">Handles on the picture</p>
        <div aria-label="What the handles do" className="image-panel__mode" role="radiogroup">
          {(['place', 'crop'] as const).map((id) => (
            <label className="image-panel__choice" key={id}>
              <input
                checked={mode === id}
                name="image-mode"
                onChange={() => onMode(id)}
                type="radio"
              />
              <span>{id === 'place' ? 'Size' : 'Crop'}</span>
            </label>
          ))}
        </div>

        {/* Explains that the toggle changes only handle behaviour, not the image. */}
        <p className="image-panel__hint">
          {mode === 'place'
            ? 'Drag the corners to resize the picture.'
            : 'Drag an edge to trim it. The picture stays where it is.'}
        </p>

        <div className="image-panel__grid">
          <ImageNumberField
            label="Width"
            min={0.5}
            onCommit={(width) =>
              place({
                ...placement,
                width,
                height: keepShape ? Math.max(0.5, width / ratio) : placement.height,
              })
            }
            unit="mm"
            value={placement.width}
          />
          <ImageNumberField
            label="Height"
            min={0.5}
            onCommit={(height) =>
              place({
                ...placement,
                height,
                width: keepShape ? Math.max(0.5, height * ratio) : placement.width,
              })
            }
            unit="mm"
            value={placement.height}
          />
          <ImageNumberField
            label="X"
            onCommit={(x) => place({ ...placement, x })}
            unit="mm"
            value={placement.x}
          />
          <ImageNumberField
            label="Y"
            onCommit={(y) => place({ ...placement, y })}
            unit="mm"
            value={placement.y}
          />
          <ImageNumberField
            label="Turn"
            max={360}
            min={-360}
            onCommit={(degrees) => onPatch({ rotation: degrees })}
            unit="°"
            value={(placement.rotation * 180) / Math.PI}
          />
          <ImageNumberField
            label="Offset"
            onCommit={(value) => onPatch({ offset: value })}
            unit="mm"
            value={offset}
          />
        </div>

        <label className="image-panel__keep">
          <input
            checked={keepShape}
            onChange={(event) => onKeepShape(event.target.checked)}
            type="checkbox"
          />
          <span>Keep proportions</span>
        </label>

        <Slider
          format={(value) => `${String(Math.round(value * 100))} %`}
          label="Opacity"
          max={1}
          min={0.05}
          onChange={slide}
          step={0.05}
          value={shownOpacity}
        />

        <div className="image-panel__plane">
          <label className="image-field__label" htmlFor={`image-plane-${feature.id}`}>
            Plane
          </label>
          <select
            className="image-panel__select"
            id={`image-plane-${feature.id}`}
            onChange={(event) => onPatch({ plane: event.target.value })}
            value={plane}
          >
            {PLANES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="image-panel__actions">
          <button
            className="image-panel__action"
            onClick={() => place(rotateBy(placement, Math.PI / 2))}
            type="button"
          >
            Turn 90°
          </button>
          <button
            className="image-panel__action"
            disabled={!cropped}
            onClick={() => place(uncrop(placement))}
            type="button"
          >
            Reset crop
          </button>
        </div>
      </div>
    </InspectionPanel>
  );
}
