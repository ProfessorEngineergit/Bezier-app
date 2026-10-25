import { describe, expect, it } from 'vitest';
import { inspectionMode, toggleSection } from './inspection-mode.js';

describe('inspection mode', () => {
  it('starts a section through the model centre and toggles it off', () => {
    expect(toggleSection(null, 7.5)).toBe(7.5);
    expect(toggleSection(7.5, 20)).toBeNull();
  });

  it('gives point measurement ownership of viewport clicks', () => {
    expect(inspectionMode(true, 7.5)).toBe('measure');
    expect(inspectionMode(false, 7.5)).toBe('section');
    expect(inspectionMode(false, null)).toBeNull();
  });
});
