/** Section view placement for inspection; never cuts or changes the document. */
import {
  SegmentedChoice,
  Toggle,
  toDisplay,
  toMillimetres,
  typedNumber,
  type ViewSettings,
} from '@bezier/ui';
import { useEffect, useRef, useState } from 'react';
import { InspectionPanel } from './InspectionPanel.js';
import { useScrub } from './scrub.js';

export function SectionPanel({
  at,
  settings,
  onChange,
  onPlane,
  onCenter,
}: {
  at: number;
  settings: ViewSettings;
  onChange: (at: number | null) => void;
  /** The plane's axis or side; the position stays unless a new axis moves it to the model. */
  onPlane: (plane: Partial<Pick<ViewSettings, 'sectionAxis' | 'sectionFlip'>>) => void;
  onCenter: () => number;
}) {
  const axis = settings.sectionAxis;
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const cancelBlur = useRef(false);
  // Dragged in the display unit; half a millimetre per pixel covers a part in a short drag and an
  // assembly with Shift.
  const scrub = useScrub({
    value: toDisplay(at, settings.unit),
    step: toDisplay(0.5, settings.unit),
    onChange: (shown) => {
      const millimetres = toMillimetres(shown, settings.unit);
      if (Number.isFinite(millimetres)) onChange(millimetres);
    },
    digits: settings.unit === 'mm' ? 2 : 4,
  });
  useEffect(() => {
    setText(String(Number(toDisplay(at, settings.unit).toFixed(4))));
    setInvalid(false);
  }, [at, settings.unit]);
  const commit = () => {
    if (cancelBlur.current) {
      cancelBlur.current = false;
      return;
    }
    const number = typedNumber(text);
    if (number === null) {
      setInvalid(true);
      return;
    }
    // A typed unit wins; a bare number is in the panel's unit.
    const millimetres = /[a-z]/i.test(text) ? number : toMillimetres(number, settings.unit);
    if (!Number.isFinite(millimetres)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(millimetres);
  };
  return (
    <InspectionPanel label="Section View" title="Section View" onClose={() => onChange(null)}>
      <SegmentedChoice
        label="Cut across"
        onChange={(next) => onPlane({ sectionAxis: next })}
        options={[
          { value: 'z', label: 'Z' },
          { value: 'y', label: 'Y' },
          { value: 'x', label: 'X' },
        ]}
        value={axis}
      />
      <Toggle
        checked={settings.sectionFlip}
        label="Flip side"
        onChange={(sectionFlip) => onPlane({ sectionFlip })}
      />
      <p className="measure-hint">Your geometry stays unchanged.</p>
      <label className="inspection-number section-position">
        {axis.toUpperCase()} position{' '}
        <span>
          <input
            {...scrub}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'section-error' : undefined}
            inputMode="decimal"
            onBlur={commit}
            onChange={(event) => {
              setText(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') {
                event.stopPropagation();
                setText(String(toDisplay(at, settings.unit)));
                setInvalid(false);
                cancelBlur.current = true;
                event.currentTarget.blur();
              }
            }}
            type="text"
            value={text}
          />
          <span>{settings.unit}</span>
        </span>
      </label>
      {invalid && (
        <p id="section-error" role="alert">
          Enter a finite decimal position.
        </p>
      )}
      <div className="inspection-actions">
        <button onClick={() => onChange(onCenter())} type="button">
          Center on model
        </button>
        <button onClick={() => onChange(0)} type="button">
          Reset to origin
        </button>
      </div>
    </InspectionPanel>
  );
}
