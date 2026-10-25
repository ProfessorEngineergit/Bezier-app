/** Section view placement for inspection; never cuts or changes the document. */
import { toDisplay, toMillimetres, typedNumber, type ViewSettings } from '@bezier/ui';
import { useEffect, useRef, useState } from 'react';
import { InspectionPanel } from './InspectionPanel.js';
import { useScrub } from './scrub.js';

export function SectionPanel({
  at,
  settings,
  onChange,
  onCenter,
}: {
  at: number;
  settings: ViewSettings;
  onChange: (at: number | null) => void;
  onCenter: () => number;
}) {
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
      <p className="inspection-panel__eyebrow">Horizontal section · XY plane</p>
      <p className="measure-hint">
        Inspect the model below the plane. Your geometry stays unchanged.
      </p>
      <label className="section-position">
        Z position{' '}
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
