import { describe, expect, it } from 'vitest';
import { HOVER_COLOUR, OUTLINE_COLOUR, SELECTED_COLOUR, selectionShades } from './highlight.js';

describe('selectionShades', () => {
  it('keeps the tuned shades for the default colour', () => {
    expect(selectionShades(OUTLINE_COLOUR)).toEqual({ fill: SELECTED_COLOUR, hover: HOVER_COLOUR });
  });

  it('fills closer to the chosen colour than it hovers', () => {
    const { fill, hover } = selectionShades(0xff0000);
    expect(fill[0]).toBeGreaterThan(hover[0]);
    expect(fill[1]).toBeLessThan(hover[1]);
  });
});
