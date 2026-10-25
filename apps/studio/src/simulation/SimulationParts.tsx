/**
 * Shared pieces of the Simulation panels: reading formatting, a number field, tool labels and
 * descriptions, and the editor for one placed support, load or thermal condition.
 */

import type { Vec3 } from '@bezier/sim';
import {
  ConvectionIcon,
  DeleteIcon,
  FixedIcon,
  ForceIcon,
  FrictionlessIcon,
  GravityIcon,
  HeatIcon,
  PinIcon,
  PressureIcon,
  TemperatureIcon,
} from '@bezier/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { useScrub } from '../scrub.js';
import type { Placement, SimTool, SimulationHandle } from './use-simulation.js';

export const TOOL_TEXT: Record<SimTool, { title: string; hint: string; icon: ReactNode }> = {
  fixed: { title: 'Fixed', hint: 'Click the faces that are held in place.', icon: <FixedIcon /> },
  pin: {
    title: 'Pin',
    hint: 'Click faces, then choose which directions are held.',
    icon: <PinIcon />,
  },
  frictionless: {
    title: 'Frictionless',
    hint: 'Click faces that may slide along themselves but not lift off.',
    icon: <FrictionlessIcon />,
  },
  force: { title: 'Force', hint: 'Click the faces the force acts on.', icon: <ForceIcon /> },
  pressure: {
    title: 'Pressure',
    hint: 'Click the faces the pressure acts on.',
    icon: <PressureIcon />,
  },
  temperature: {
    title: 'Temperature',
    hint: 'Click the faces held at a temperature: a cold plate, a heat sink, a wall.',
    icon: <TemperatureIcon />,
  },
  heat: {
    title: 'Heat',
    hint: 'Click the faces heat comes in through: a heater, a chip, a motor.',
    icon: <HeatIcon />,
  },
  convection: {
    title: 'Convection',
    hint: 'Click the faces the air carries heat away from.',
    icon: <ConvectionIcon />,
  },
};

export function titleOf(placement: Placement): string {
  if (placement.kind === 'gravity') return 'Gravity';
  return TOOL_TEXT[placement.kind].title;
}

export function iconOf(placement: Placement): ReactNode {
  return placement.kind === 'gravity' ? <GravityIcon /> : TOOL_TEXT[placement.kind].icon;
}

export function summaryOf(placement: Placement): string {
  const faces =
    'faces' in placement
      ? `${placement.faces.length} face${placement.faces.length === 1 ? '' : 's'}`
      : '';
  switch (placement.kind) {
    case 'force':
      return `${format(placement.magnitude)} N · ${faces}`;
    case 'pressure':
      return `${format(placement.pressure)} MPa · ${faces}`;
    case 'gravity':
      return '9.81 m/s² · −Z';
    case 'pin': {
      const axes = ['X', 'Y', 'Z'].filter((_, index) => placement.axes[index]).join('');
      return `${axes || 'none'} · ${faces}`;
    }
    case 'temperature':
      return `${format(placement.temperature)} °C · ${faces}`;
    case 'heat':
      return `${format(placement.power)} W · ${faces}`;
    case 'convection':
      return `${format(placement.coefficient)} W/m²K · ${faces}`;
    default:
      return faces;
  }
}

/**
 * Formats a reading as an engineer would: about three significant figures, no trailing zeros
 * (100 N, 3.5 GPa, 0.012 mm), never "100.0" or "50.00".
 */
export function format(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const size = Math.abs(value);
  if (size === 0) return '0';
  const text =
    size >= 1000
      ? value.toFixed(0)
      : size >= 100
        ? value.toFixed(1)
        : size >= 1
          ? value.toFixed(2)
          : value.toPrecision(3);
  return text.includes('.') && !text.includes('e') ? text.replace(/\.?0+$/, '') : text;
}

export function NumberField({
  label,
  value,
  unit,
  onCommit,
  step = 1,
}: {
  label: string;
  value: number;
  unit: string;
  onCommit: (value: number) => void;
  /** Change per pixel dragged up or down (`scrub.ts`), in the field's unit. */
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const scrub = useScrub({
    value,
    step,
    onChange: onCommit,
    digits: Math.max(0, -Math.floor(Math.log10(step))),
  });
  const commit = () => {
    const next = Number(text.replace(',', '.'));
    if (Number.isFinite(next)) onCommit(next);
    else setText(String(value));
  };
  return (
    <label className="sim-field">
      <span>{label}</span>
      <span className="sim-field__input">
        <input
          {...scrub}
          inputMode="decimal"
          onBlur={commit}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          type="text"
          value={text}
        />
        <small>{unit}</small>
      </span>
    </label>
  );
}

const DIRECTIONS: readonly { label: string; vector: Vec3 }[] = [
  { label: '−X', vector: [-1, 0, 0] },
  { label: '+X', vector: [1, 0, 0] },
  { label: '−Y', vector: [0, -1, 0] },
  { label: '+Y', vector: [0, 1, 0] },
  { label: '−Z', vector: [0, 0, -1] },
  { label: '+Z', vector: [0, 0, 1] },
];

/**
 * Editor for one placed support, load or thermal condition, at the top of the study panel while it
 * is being edited, so the model stays clear for clicking faces.
 */
export function PlacementEditor({
  sim,
  placement,
}: {
  sim: SimulationHandle;
  placement: Placement;
}) {
  const faces = 'faces' in placement ? placement.faces.length : 0;
  const update = (patch: Parameters<SimulationHandle['updatePlacement']>[1]) =>
    sim.updatePlacement(placement.id, patch);
  // A support with nothing to set (Fixed, Frictionless) is complete once it has faces; no confirm
  // button.
  const settled = placement.kind === 'fixed' || placement.kind === 'frictionless';
  return (
    <section aria-label={titleOf(placement)} className="sim-editor">
      <header>
        {iconOf(placement)}
        <strong>{titleOf(placement)}</strong>
        {!settled && (
          <button onClick={() => sim.setEditing(null)} type="button">
            Done
          </button>
        )}
      </header>
      {'faces' in placement && (
        <p className="sim-editor__faces">
          <b>{faces}</b> face{faces === 1 ? '' : 's'} · click faces to add or remove, Esc or a click
          beside the part when done
        </p>
      )}
      {placement.kind === 'force' && (
        <>
          <NumberField
            label="Magnitude"
            onCommit={(magnitude) => update({ magnitude })}
            unit="N"
            value={placement.magnitude}
          />
          <div className="sim-editor__group">
            <span>Direction</span>
            <div className="sim-segment sim-segment--wide">
              {DIRECTIONS.map((direction) => (
                <button
                  aria-pressed={direction.vector.every(
                    (v, i) => Math.abs(v - (placement.direction[i] as number)) < 1e-6,
                  )}
                  key={direction.label}
                  onClick={() => update({ direction: direction.vector })}
                  type="button"
                >
                  {direction.label}
                </button>
              ))}
            </div>
            <button
              className="sim-editor__flip"
              onClick={() =>
                update({
                  direction: [
                    -placement.direction[0],
                    -placement.direction[1],
                    -placement.direction[2],
                  ],
                })
              }
              type="button"
            >
              Flip direction
            </button>
          </div>
        </>
      )}
      {placement.kind === 'pressure' && (
        <>
          <NumberField
            label="Pressure"
            step={0.01}
            onCommit={(pressure) => update({ pressure })}
            unit="MPa"
            value={placement.pressure}
          />
          <p className="sim-note">Positive pushes into the part. 0.1 MPa is one bar.</p>
        </>
      )}
      {placement.kind === 'pin' && (
        <div className="sim-editor__group">
          <span>Held directions</span>
          <div className="sim-segment sim-segment--wide">
            {(['X', 'Y', 'Z'] as const).map((axis, index) => (
              <button
                aria-pressed={placement.axes[index]}
                key={axis}
                onClick={() => {
                  const axes = [...placement.axes] as [boolean, boolean, boolean];
                  axes[index] = !axes[index];
                  update({ axes });
                }}
                type="button"
              >
                {axis}
              </button>
            ))}
          </div>
        </div>
      )}
      {placement.kind === 'fixed' && <p className="sim-note">No movement in any direction.</p>}
      {placement.kind === 'frictionless' && (
        <p className="sim-note">Held along the face normal, free to slide along the face.</p>
      )}
      {placement.kind === 'temperature' && (
        <NumberField
          label="Temperature"
          step={0.5}
          onCommit={(temperature) => update({ temperature })}
          unit="°C"
          value={placement.temperature}
        />
      )}
      {placement.kind === 'heat' && (
        <>
          <NumberField
            label="Power"
            step={0.1}
            onCommit={(power) => update({ power })}
            unit="W"
            value={placement.power}
          />
          <p className="sim-note">All of it enters through these faces, shared by area.</p>
        </>
      )}
      {placement.kind === 'convection' && (
        <>
          <NumberField
            label="Film coefficient"
            step={0.5}
            onCommit={(coefficient) => update({ coefficient })}
            unit="W/m²K"
            value={placement.coefficient}
          />
          <NumberField
            label="Air"
            step={0.5}
            onCommit={(ambient) => update({ ambient })}
            unit="°C"
            value={placement.ambient}
          />
          <p className="sim-note">Still air is about 10, a fan 25 to 100, water 500 and more.</p>
        </>
      )}
      <footer>
        <button
          className="sim-editor__delete"
          onClick={() => sim.removePlacement(placement.id)}
          type="button"
        >
          <DeleteIcon />
          Delete
        </button>
      </footer>
    </section>
  );
}
