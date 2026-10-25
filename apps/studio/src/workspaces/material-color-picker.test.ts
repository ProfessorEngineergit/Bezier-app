import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex } from './MaterialColorPicker.js';

describe('material colour conversion', () => {
  it('round-trips exact material colours through HSV', () => {
    for (const color of ['#c83c35', '#416fab', '#ecebe7', '#202124']) {
      expect(hsvToHex(hexToHsv(color))).toBe(color);
    }
  });

  it('keeps grayscale colours finite and neutral', () => {
    expect(hexToHsv('#808080')).toEqual({ h: 0, s: 0, v: 128 / 255 });
  });
});
