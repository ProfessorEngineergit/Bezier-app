/**
 * The building blocks of the Settings pages: group, row, switch, choice, select, note and keycaps.
 */

import { isApple } from '@bezier/ui';

export function Group({
  label,
  note,
  children,
}: {
  label: string;
  note?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="prefs-group">
      <h2 className="prefs-group__label">{label}</h2>
      <div className="prefs-group__box">{children}</div>
      {note && <p className="prefs-group__note">{note}</p>}
    </section>
  );
}
export function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="prefs-row">
      <span className="prefs-row__label">
        {label}
        {note && <small className="prefs-row__note">{note}</small>}
      </span>
      {children}
    </div>
  );
}
export function Switch({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      aria-label={label}
      checked={checked}
      className="prefs-switch"
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      type="checkbox"
    />
  );
}
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="prefs-radio-group">
      {options.map(([id, label]) => (
        <label className="prefs-radio" key={id}>
          <input checked={value === id} name={name} onChange={() => onChange(id)} type="radio" />
          {label}
        </label>
      ))}
    </div>
  );
}
/** A row of colour swatches, each named for screen readers and on hover. */
export function Swatches({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="prefs-swatches">
      {options.map(([colour, label]) => (
        <label className="prefs-swatch" key={colour} title={label} style={{ color: colour }}>
          <input
            aria-label={label}
            checked={value === colour}
            name={name}
            onChange={() => onChange(colour)}
            type="radio"
          />
        </label>
      ))}
    </div>
  );
}
export function Choices<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="prefs-choices">
      {options.map(([id, label, detail]) => (
        <label className="prefs-choice" key={id}>
          <input checked={value === id} name={name} onChange={() => onChange(id)} type="radio" />
          <span className="prefs-choice__text">
            <b>{label}</b>
            <span className="prefs-choice__detail">{detail}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
export function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  /** Accessible label, since the row label is not a <label>. */
  label?: string;
}) {
  return (
    <select
      aria-label={label}
      className="prefs-select"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
}
/** Marks a row as not built yet, in place of its control. */
export function Planned({ children = 'In development' }: { children?: React.ReactNode }) {
  return <span className="prefs-planned">{children}</span>;
}
export function Keys({ value }: { value: string }) {
  // Accepts free text such as `Alt+Cmd+1–4`, so it is drawn token by token: Mac symbols on a Mac,
  // key names elsewhere.
  const mac = isApple();
  const symbols: Record<string, string> = mac
    ? { Cmd: '⌘', Shift: '⇧', Ctrl: '⌃', Alt: '⌥', Enter: '↩', Backspace: '⌫' }
    : { Cmd: 'Ctrl', Enter: 'Enter' };
  return (
    <span className="prefs-keys">
      {value.split('+').map((key) => (
        <kbd key={key}>{symbols[key] ?? key}</kbd>
      ))}
    </span>
  );
}
