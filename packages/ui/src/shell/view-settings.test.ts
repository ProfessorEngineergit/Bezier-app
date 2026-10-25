import { describe, expect, it } from 'vitest';
import type { ViewSettings } from './view-settings.js';
import {
  applyGridLock,
  DEFAULT_VIEW_SETTINGS,
  formatLength,
  toDisplay,
  toMillimetres,
} from './view-settings.js';

function withSettings(patch: Partial<ViewSettings>): ViewSettings {
  return { ...DEFAULT_VIEW_SETTINGS, ...patch };
}

describe('unit conversion', () => {
  it('leaves millimetres alone', () => {
    expect(toDisplay(42, 'mm')).toBe(42);
  });

  it('converts to each supported unit', () => {
    expect(toDisplay(1000, 'm')).toBe(1);
    expect(toDisplay(25.4, 'in')).toBeCloseTo(1);
    expect(toDisplay(304.8, 'ft')).toBeCloseTo(1);
  });

  it('round-trips through the display unit', () => {
    // The document stores millimetres; anything a user types has to come back as the same number of
    // them, or a saved file quietly changes size.
    for (const unit of ['mm', 'cm', 'm', 'in', 'ft'] as const) {
      expect(toMillimetres(toDisplay(137.5, unit), unit)).toBeCloseTo(137.5, 6);
    }
  });
});

describe('formatLength', () => {
  it('shows a decimal with its unit', () => {
    expect(formatLength(42.5, withSettings({ unit: 'mm' }))).toBe('42.5 mm');
  });

  it('trims trailing zeros rather than implying precision', () => {
    expect(formatLength(1000, withSettings({ unit: 'm' }))).toBe('1 m');
  });

  it('writes imperial as a fraction when asked', () => {
    // 0.375 in is 3/8; a decimal there reads as a measurement nobody took.
    expect(formatLength(25.4 * 1.375, withSettings({ unit: 'in', format: 'fractional' }))).toBe(
      '1 3/8 in',
    );
  });

  it('reduces the fraction', () => {
    expect(formatLength(25.4 * 0.5, withSettings({ unit: 'in', format: 'fractional' }))).toBe(
      '1/2 in',
    );
  });

  it('drops the fraction when it rounds away', () => {
    expect(formatLength(25.4 * 2, withSettings({ unit: 'in', format: 'fractional' }))).toBe('2 in');
  });

  it('ignores fractional formatting for metric units', () => {
    // Nobody writes 3/8 mm. Asking for it should not produce it.
    expect(formatLength(42.5, withSettings({ unit: 'mm', format: 'fractional' }))).toBe('42.5 mm');
  });

  it('keeps the sign on a value below one unit', () => {
    expect(formatLength(-25.4 * 0.25, withSettings({ unit: 'in', format: 'fractional' }))).toBe(
      '-1/4 in',
    );
  });
});

describe('applyGridLock', () => {
  it('leaves values alone when snapping is off', () => {
    expect(applyGridLock(13.7, withSettings({ gridLock: null }))).toBe(13.7);
  });

  it('snaps to the nearest increment', () => {
    expect(applyGridLock(13.7, withSettings({ gridLock: 5 }))).toBe(15);
    expect(applyGridLock(12.4, withSettings({ gridLock: 5 }))).toBe(10);
  });

  it('refuses a nonsensical increment rather than dividing by zero', () => {
    expect(applyGridLock(13.7, withSettings({ gridLock: 0 }))).toBe(13.7);
    expect(applyGridLock(13.7, withSettings({ gridLock: -5 }))).toBe(13.7);
  });
});

describe('grid position', () => {
  it('starts on the XY sketch plane', () => {
    expect(DEFAULT_VIEW_SETTINGS.gridPlane).toBe('XY');
  });
});
