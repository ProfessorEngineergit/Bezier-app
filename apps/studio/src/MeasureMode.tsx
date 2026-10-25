/** A point-measurement session, with readings pinned per project. */

import type { DisplayGeometry } from '@bezier/renderer';
import { CrossIcon, formatLength, type ViewSettings } from '@bezier/ui';
import { useEffect, useRef, useState } from 'react';
import { InspectionPanel } from './InspectionPanel.js';
import { MeasurementOverlay } from './MeasurementOverlay.js';
import { loadPins, modelSignature, type Pin, savePins } from './measure-pins.js';
import { angleAt, type MeasurePoint, measurement } from './measurements.js';
import type { ViewportHandle } from './Viewport.js';

export { measurement } from './measurements.js';

interface MeasureModeProps {
  handleRef: React.RefObject<ViewportHandle | null>;
  active: boolean;
  geometry: DisplayGeometry | null;
  points: readonly MeasurePoint[];
  /** The project the pins belong to. */
  project: string | null;
  onClear: () => void;
  onClose: () => void;
  settings: ViewSettings;
  /** Whole-body measurements of the picked bodies, shown above the point measurement. */
  body?: React.ReactNode;
}

/**
 * A measurement that copies itself to the clipboard when clicked, saving retyping. The "copy" label
 * appears only on hover.
 */
function CopyValue({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      aria-label={`Copy ${label}: ${text}`}
      className="measure-copy"
      data-copied={copied ? '' : undefined}
      onClick={() => {
        // A refused clipboard fails silently rather than claiming success.
        void navigator.clipboard
          ?.writeText(text)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
      type="button"
    >
      {/* The label is drawn by the stylesheet so the text content stays exactly the
          measurement, which tests read. */}
      {text}
    </button>
  );
}

export function MeasureMode({
  handleRef,
  active,
  geometry,
  points,
  project,
  onClear,
  onClose,
  settings,
  body,
}: MeasureModeProps) {
  const [deltas, setDeltas] = useState(false);
  const [pinned, setPinned] = useState<readonly Pin[]>([]);
  const nextId = useRef(1);
  const signature = modelSignature(geometry);
  // Load the project's pins when it opens; mark stale ones when the model changes under them.
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (project === null) return;
    if (loaded.current !== project) {
      // Wait for the model, so the signature compared is the model's.
      if (signature === '') return;
      loaded.current = project;
      const pins = loadPins(project, signature);
      nextId.current = Math.max(0, ...pins.map((pin) => pin.id)) + 1;
      setPinned(pins);
      return;
    }
    setPinned((pins) => pins.map((pin) => ({ ...pin, stale: true })));
  }, [project, signature]);
  useEffect(() => {
    if (project !== null && loaded.current === project) savePins(project, signature, pinned);
  }, [project, signature, pinned]);
  const result = measurement(points);
  const angle = angleAt(points);
  const isPinned = pinned.some((item) => item.points === points);

  return (
    <>
      {/* A pin from before a change is listed but not drawn: its points may no longer lie on
          the model. */}
      {pinned
        .filter((item) => item.stale !== true)
        .map((item) => (
          <MeasurementOverlay
            handleRef={handleRef}
            key={item.id}
            points={item.points}
            settings={settings}
          />
        ))}
      {active && (
        <>
          <MeasurementOverlay
            handleRef={handleRef}
            points={isPinned ? [] : points}
            settings={settings}
            showSnaps={points.length < 2}
          />
          <div className="inspection-mode-label">
            <span aria-hidden="true">↔</span> Point-to-Point Distance
          </div>
          <InspectionPanel label="Measurements" onClose={onClose} title="Measure">
            {body}
            <p className="inspection-panel__eyebrow">Point-to-point distance</p>
            <div className="measure-steps">
              <span data-complete={points.length > 0}>
                <b>1</b> First point
              </span>
              <span data-complete={points.length > 1}>
                <b>2</b> Second point
              </span>
              <span data-complete={points.length > 2}>
                <b>3</b> Third, for an angle
              </span>
            </div>
            <p aria-live="polite" className="measure-hint">
              {result
                ? 'Straight-line distance between the selected points.'
                : points.length === 0
                  ? 'Select two points on the model.'
                  : 'Select second point on the model.'}
            </p>
            {result && (
              <dl className="measure-result">
                <div>
                  <dt>Distance</dt>
                  <dd>
                    <CopyValue label="distance" text={formatLength(result.distance, settings)} />
                  </dd>
                </div>
              </dl>
            )}
            {angle !== null && (
              <dl className="measure-angle">
                <div>
                  <dt>Angle at the second point</dt>
                  <dd>
                    <CopyValue label="angle" text={`${Number(angle.toFixed(2))}°`} />
                  </dd>
                </div>
              </dl>
            )}
            <label className="inspection-toggle">
              <span>Include X, Y, Z deltas</span>
              <input
                checked={deltas}
                aria-checked={deltas}
                onChange={(event) => setDeltas(event.target.checked)}
                role="switch"
                type="checkbox"
              />
            </label>
            {result && deltas && (
              <dl className="measure-deltas">
                {(['dx', 'dy', 'dz'] as const).map((axis) => (
                  <div key={axis}>
                    <dt>Δ{axis.slice(1).toUpperCase()}</dt>
                    <dd>
                      <CopyValue
                        label={`Δ${axis.slice(1).toUpperCase()}`}
                        text={formatLength(
                          Math.abs(result[axis]) < 1e-9 ? 0 : result[axis],
                          settings,
                        )}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="inspection-actions">
              <button
                disabled={!result || isPinned}
                onClick={() => {
                  if (result) {
                    const id = nextId.current++;
                    setPinned((items) => [...items, { id, points }]);
                  }
                }}
                type="button"
              >
                {isPinned ? 'Pinned' : 'Pin measurement'}
              </button>
              <button disabled={points.length === 0} onClick={onClear} type="button">
                {result ? 'New measurement' : 'Clear'}
              </button>
            </div>
            <section className="measure-pinned" aria-label="Pinned measurements">
              <h3>
                Pinned <span>{pinned.length}</span>
              </h3>
              {pinned.length === 0 ? (
                <p>Pin a measurement to keep it visible after leaving Measure.</p>
              ) : (
                <ul>
                  {pinned.map((item) => (
                    <li key={item.id}>
                      <span>
                        Distance {item.id}
                        {item.stale === true && (
                          <small title="The model has changed since this was pinned.">
                            {' '}
                            · may be out of date
                          </small>
                        )}
                      </span>
                      <strong>
                        <CopyValue
                          label={`distance ${item.id}`}
                          text={formatLength(measurement(item.points)?.distance ?? 0, settings)}
                        />
                      </strong>
                      <button
                        aria-label={`Unpin measurement ${item.id}`}
                        onClick={() =>
                          setPinned((items) => items.filter((entry) => entry.id !== item.id))
                        }
                        type="button"
                      >
                        <CrossIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="measure-pinned__note">
                Pins stay with this project. After a change to the model they are marked.
              </p>
            </section>
          </InspectionPanel>
        </>
      )}
    </>
  );
}
