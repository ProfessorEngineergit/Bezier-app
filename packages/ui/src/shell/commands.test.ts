/** Cycling a tool's variants with its key, starting from the right variant. */

import { describe, expect, it } from 'vitest';
import { nextVariant, variantsOf } from './commands.js';

describe('nextVariant', () => {
  it('advances through a command’s live variants and wraps', () => {
    const first = nextVariant('rectangle', 'center-rectangle');
    expect(first).not.toBeNull();
    expect(first).not.toBe('center-rectangle');
    expect(nextVariant('rectangle', first)).toBe('center-rectangle');
  });

  it('does not cycle from nothing, so the first press gets the default', () => {
    // Rectangle lists Center first and declares Diagonal as its default. A cycle that treated
    // "nothing active" as "before the first entry" would open the tool on Center, which is not what
    // the rail says.
    expect(nextVariant('rectangle', null)).toBeNull();
  });

  it('offers exactly the rectangles that can be drawn', () => {
    expect(variantsOf('rectangle')).toEqual(['center-rectangle', 'diagonal-rectangle']);
  });

  it('has nothing to offer for a command without variants', () => {
    expect(nextVariant('line', 'line')).toBeNull();
    expect(variantsOf('line')).toEqual([]);
  });
});
