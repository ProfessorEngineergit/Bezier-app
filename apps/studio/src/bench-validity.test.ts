import { describe, expect, it } from 'vitest';
import { invalidity } from './bench-validity.js';

const figures = { cpu: 0.4, gap: 16.7, pick: 0.1 };

describe('whether a frame-budget run measured anything', () => {
  it('holds when the camera turned and a frame was drawn for every step', () => {
    expect(invalidity(120, 120, 120, figures)).toBeNull();
  });

  it('refuses the run Windows reported: no turn, no frames, NaN for the frame cost', () => {
    expect(invalidity(120, 0, 0, { ...figures, cpu: Number.NaN })).toBe(
      'the camera turned on 0 of 120 steps',
    );
  });

  it('refuses a turning camera that was not drawn', () => {
    expect(invalidity(120, 120, 30, figures)).toBe('30 frames drawn for 120 steps');
  });

  it('refuses a missing figure even when the run moved', () => {
    expect(invalidity(120, 120, 120, { ...figures, pick: Number.NaN })).toBe('a figure is missing');
  });
});
