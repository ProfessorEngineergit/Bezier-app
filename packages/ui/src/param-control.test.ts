import type { ParamsSpec, StableRef } from '@bezier/core';
import { faceRef, formatRef } from '@bezier/core';
import { describe, expect, it } from 'vitest';
import { controlsFor, formatNumber, valueFromInput } from './param-control.js';

/** One of each kind, so the mapping is covered end to end and not sampled. */
const spec = {
  distance: { kind: 'length', label: 'Distance', default: 10, min: 0.1, max: 500 },
  twist: { kind: 'angle', label: 'Twist', default: Math.PI / 2 },
  copies: { kind: 'count', label: 'Copies', default: 1, min: 1 },
  symmetric: { kind: 'boolean', label: 'Symmetric', default: false },
  direction: { kind: 'choice', label: 'Direction', options: ['up', 'down'], default: 'up' },
  profile: { kind: 'featureRef', label: 'Profile' },
  edges: { kind: 'geometryRefs', label: 'Edges', of: 'edge' },
  geometry: { kind: 'sketch', label: 'Geometry' },
} as const satisfies ParamsSpec;

describe('controlsFor', () => {
  it('offers a number only while what it depends on makes it do something (audit F-035)', () => {
    const hole = {
      through: { kind: 'boolean', label: 'Through all', default: false },
      depth: { kind: 'length', label: 'Depth', default: 10, when: { through: [false] } },
      style: {
        kind: 'choice',
        label: 'Style',
        options: ['simple', 'counterbore'],
        default: 'simple',
      },
      headDepth: {
        kind: 'length',
        label: 'Head depth',
        default: 3,
        when: { style: ['counterbore'] },
      },
    } as const satisfies ParamsSpec;
    const keys = (params: Record<string, unknown>) => controlsFor(hole, params).map((c) => c.key);
    expect(keys({})).toEqual(['through', 'depth', 'style']);
    expect(keys({ through: true, style: 'counterbore' })).toEqual([
      'through',
      'style',
      'headDepth',
    ]);
  });

  it('keeps the order the schema declares', () => {
    const keys = controlsFor(spec, {}).map((c) => c.key);
    expect(keys).toEqual([
      'distance',
      'twist',
      'copies',
      'symmetric',
      'direction',
      'profile',
      'edges',
      'geometry',
    ]);
  });

  it('leaves out a choice fixed when the feature was made', () => {
    const spec: ParamsSpec = {
      depth: { kind: 'length', label: 'Depth', default: 10 },
      faceOrder: {
        kind: 'choice',
        label: 'Face order',
        options: ['a', 'b'],
        default: 'a',
        fixed: true,
      },
    };
    expect(controlsFor(spec, {}).map((control) => control.key)).toEqual(['depth']);
  });

  it('falls back to the declared default when a value is missing', () => {
    const [distance] = controlsFor(spec, {});
    expect(distance).toMatchObject({ kind: 'number', value: 10, unit: 'mm' });
  });

  it('carries the declared bounds onto the control', () => {
    const [distance] = controlsFor(spec, {});
    expect(distance).toMatchObject({ min: 0.1, max: 500 });
  });

  it('shows angles in degrees although they are stored in radians', () => {
    const controls = controlsFor(spec, { twist: Math.PI });
    const twist = controls.find((c) => c.key === 'twist');
    expect(twist).toMatchObject({ kind: 'number', value: 180, unit: '°' });
  });

  it('leaves a count without a unit', () => {
    const copies = controlsFor(spec, {}).find((c) => c.key === 'copies');
    expect(copies).toMatchObject({ kind: 'number', unit: '', step: 1 });
  });

  it('maps each parameter kind to its own control', () => {
    const kinds = Object.fromEntries(controlsFor(spec, {}).map((c) => [c.key, c.kind]));
    expect(kinds).toEqual({
      distance: 'number',
      twist: 'number',
      copies: 'number',
      symmetric: 'toggle',
      direction: 'select',
      profile: 'feature',
      edges: 'refs',
      geometry: 'sketch',
    });
  });

  it('passes a choice its options so the panel need not know them', () => {
    const direction = controlsFor(spec, {}).find((c) => c.key === 'direction');
    expect(direction).toMatchObject({ value: 'up', options: ['up', 'down'] });
  });

  it('carries picked geometry through unchanged', () => {
    const picked = [faceRef('extrude-1', 'end')];
    const edges = controlsFor(spec, { edges: picked }).find((c) => c.key === 'edges');
    expect(edges).toMatchObject({ kind: 'refs', of: 'edge', value: picked });
  });

  it('parses references stored as text, which is how a document holds them', () => {
    // The panel reads raw feature params, and a saved document stores refs in canonical text form;
    // treated as objects, every reference renders blank with undefined React keys.
    const control = controlsFor(spec, {
      edges: ['E(F:extrude-1:end|F:extrude-1:side-2)'],
    }).find((c) => c.key === 'edges');

    expect(control?.kind).toBe('refs');
    const value = control?.kind === 'refs' ? control.value : [];
    expect(value).toHaveLength(1);
    expect(value[0]?.kind).toBe('edge');
    expect(formatRef(value[0] as StableRef)).toBe('E(F:extrude-1:end|F:extrude-1:side-2)');
  });

  it('drops a reference it cannot read rather than rendering a blank row', () => {
    const control = controlsFor(spec, {
      edges: ['F:extrude-1:end', 'not a reference', ''],
    }).find((c) => c.key === 'edges');

    const value = control?.kind === 'refs' ? control.value : [];
    expect(value).toHaveLength(1);
    expect(formatRef(value[0] as StableRef)).toBe('F:extrude-1:end');
  });

  it('survives a stored value of the wrong type', () => {
    // Parameters come off disk as unknown data. A panel that throws on a corrupted document is a
    // document the user cannot open to fix.
    const controls = controlsFor(spec, { distance: 'not a number', symmetric: 42 });
    expect(controls[0]).toMatchObject({ value: 10 });
    expect(controls.find((c) => c.key === 'symmetric')).toMatchObject({ value: false });
  });
});

describe('valueFromInput', () => {
  it('reads a plain length', () => {
    expect(valueFromInput(spec.distance, '25.5')).toBe(25.5);
  });

  it('converts a typed angle back into radians', () => {
    expect(valueFromInput(spec.twist, '180')).toBeCloseTo(Math.PI);
  });

  it('refuses a value outside the declared bounds', () => {
    // Declined, not clamped: clamping changes what the user typed without them noticing.
    expect(valueFromInput(spec.distance, '0.05')).toBeNull();
    expect(valueFromInput(spec.distance, '900')).toBeNull();
  });

  it('refuses a fractional count', () => {
    expect(valueFromInput(spec.copies, '2.5')).toBeNull();
    expect(valueFromInput(spec.copies, '3')).toBe(3);
  });

  it('refuses text that is not a number', () => {
    expect(valueFromInput(spec.distance, 'abc')).toBeNull();
    expect(valueFromInput(spec.distance, '')).toBeNull();
    expect(valueFromInput(spec.distance, '  ')).toBeNull();
  });

  it('refuses infinity, which Number() would otherwise accept', () => {
    expect(valueFromInput(spec.distance, 'Infinity')).toBeNull();
  });

  it('has nothing to say about non-numeric parameters', () => {
    expect(valueFromInput(spec.direction, 'up')).toBeNull();
    expect(valueFromInput(spec.geometry, 'anything')).toBeNull();
  });

  it('round-trips a length through the control and back', () => {
    const control = controlsFor(spec, { distance: 42.25 })[0];
    expect(control?.kind).toBe('number');
    const text = formatNumber(control?.kind === 'number' ? control.value : Number.NaN);
    expect(valueFromInput(spec.distance, text)).toBe(42.25);
  });

  it('round-trips an angle through degrees without drifting', () => {
    const stored = Math.PI / 3;
    const shown = controlsFor(spec, { twist: stored }).find((c) => c.key === 'twist');
    const text = formatNumber(shown?.kind === 'number' ? shown.value : Number.NaN);
    expect(valueFromInput(spec.twist, text)).toBeCloseTo(stored, 5);
  });
});

describe('an angle stored in degrees', () => {
  // Revolve's `angleDegrees`: saved documents hold degrees, so the panel must not convert (a full
  // turn would show as 20,626°).
  const revolve = {
    angleDegrees: {
      kind: 'angle',
      label: 'Angle',
      default: 360,
      degrees: true,
      min: 0.01,
      max: 360,
    },
  } as const satisfies ParamsSpec;

  it('shows the stored degrees as they are', () => {
    const [control] = controlsFor(revolve, { angleDegrees: 360 });
    expect(control?.kind === 'number' ? control.value : null).toBe(360);
    expect(control?.kind === 'number' ? control.max : null).toBe(360);
  });

  it('stores what is typed, and refuses a turn past the limit', () => {
    expect(valueFromInput(revolve.angleDegrees, '90')).toBe(90);
    expect(valueFromInput(revolve.angleDegrees, '400')).toBeNull();
  });
});

describe('formatNumber', () => {
  it('trims trailing zeros rather than implying false precision', () => {
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(12.500001)).toBe('12.5');
  });

  it('gives an empty field for a value that is not a number', () => {
    expect(formatNumber(Number.NaN)).toBe('');
  });
});
