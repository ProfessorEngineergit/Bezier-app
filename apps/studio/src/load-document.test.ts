import { describe, expect, it } from 'vitest';
import { LONG_TEXT, longTexts } from './load-document.js';

describe('the long texts of a document', () => {
  it('are found in the same order however often the walk is made', () => {
    const file = 'x'.repeat(LONG_TEXT + 1);
    const other = 'y'.repeat(LONG_TEXT + 2);
    const features = [
      { id: 'sketch-1', params: { plane: 'XY', note: 'short' } },
      { id: 'import-1', params: { file, faceOrder: 'file' } },
      { id: 'import-2', params: { nested: [{ file: other }] } },
    ];
    expect(longTexts(features)).toEqual([file, other]);
    // A structured clone keeps key order, which lets the page pair each text with the digest the
    // worker took of it.
    expect(longTexts(structuredClone(features))).toEqual([file, other]);
  });
});
